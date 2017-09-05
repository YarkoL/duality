var __extends = this && this.__extends || function(e, t) {
    for (var n in t)
        if (t.hasOwnProperty(n)) e[n] = t[n];
    function i() {
        this.constructor = e
    }
    e.prototype = t === null ? Object.create(t) : (i.prototype = t.prototype, new i)
};
var CallException = function() {
    function e(e) {
        this.mErrorMsg = e
    }
    e.prototype.ErrorMsg = function() {};
    return e
}();
var InvalidOperationException = function(e) {
    __extends(t, e);

    function t() {
        e.apply(this, arguments)
    }
    return t
}(CallException);
var CallState;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["Initialized"] = 1] = "Initialized";
    e[e["Configuring"] = 2] = "Configuring";
    e[e["Configured"] = 3] = "Configured";
    e[e["RequestingAddress"] = 4] = "RequestingAddress";
    e[e["WaitingForIncomingCall"] = 5] = "WaitingForIncomingCall";
    e[e["WaitingForOutgoingCall"] = 6] = "WaitingForOutgoingCall";
    e[e["InCall"] = 7] = "InCall";
    e[e["Closed"] = 8] = "Closed"
})(CallState || (CallState = {}));
var AWebRtcCall = function() {
    function e(e) {
        if (e === void 0) {
            e = null
        }
        this.mNetworkConfig = new NetworkConfig;
        this.mMediaConfig = null;
        this.mCallEventHandlers = [];
        this.mNetwork = null;
        this.mConferenceMode = false;
        this.mState = CallState.Invalid;
        this.mIsDisposed = false;
        this.mServerInactive = true;
        this.mConnectionIds = new Array;
        this.mPendingListenCall = false;
        this.mPendingCallCall = false;
        this.mPendingAddress = null;
        if (e != null) {
            this.mNetworkConfig = e;
            this.mConferenceMode = e.IsConference
        }
    }
    e.prototype.addEventListener = function(e) {
        this.mCallEventHandlers.push(e)
    };
    e.prototype.removeEventListener = function(e) {
        this.mCallEventHandlers = this.mCallEventHandlers.filter(function(t) {
            return t !== e
        })
    };
    Object.defineProperty(e.prototype, "State", {
        get: function() {
            return this.mState
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.Initialize = function(e) {
        this.mNetwork = e;
        this.mState = CallState.Initialized
    };
    e.prototype.Configure = function(e) {
        this.CheckDisposed();
        if (this.mState != CallState.Initialized) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState)
        }
        this.mState = CallState.Configuring;
        console.log("Enter state CallState.Configuring");
        this.mMediaConfig = e;
        this.mNetwork.Configure(this.mMediaConfig)
    };
    e.prototype.Call = function(e) {
        this.CheckDisposed();
        if (this.mState != CallState.Initialized && this.mState != CallState.Configuring && this.mState != CallState.Configured) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState)
        }
        if (this.mConferenceMode) {
            throw new InvalidOperationException("Method can't be used in conference calls.")
        }
        console.log("Call to " + e);
        this.EnsureConfiguration();
        if (this.mState == CallState.Configured) {
            this.ProcessCall(e)
        } else {
            this.PendingCall(e)
        }
    };
    e.prototype.Listen = function(e) {
        this.CheckDisposed();
        if (this.mState != CallState.Initialized && this.mState != CallState.Configuring && this.mState != CallState.Configured) {
            throw new InvalidOperationException("Method can't be used in state " + this.mState)
        }
        this.EnsureConfiguration();
        if (this.mState == CallState.Configured) {
            this.ProcessListen(e)
        } else {
            this.PendingListen(e)
        }
    };
    e.prototype.Send = function(e) {
        this.CheckDisposed();
        var t = Encoding.UTF16.GetBytes(e);
        //var t = stringToByteArray(e);
        for (var n = 0, i = this.mConnectionIds; n < i.length; n++) {
            var r = i[n];
            console.log("Send message to " + r + "! " + e);
            this.mNetwork.SendData(new ConnectionId(r), t, true)
        }
    };
    e.prototype.Update = function() {
        if (this.mIsDisposed) return;
        if (this.mNetwork == null) return;
        this.mNetwork.Update();
        if (this.mState == CallState.Configuring) {
            var e = this.mNetwork.GetConfigurationState();
            if (e == MediaConfigurationState.Failed) {
                this.OnConfigurationFailed(this.mNetwork.GetConfigurationError());
                if (this.mIsDisposed) return;
                if (this.mNetwork != null) this.mNetwork.ResetConfiguration()
            } else if (e == MediaConfigurationState.Successful) {
                this.OnConfigurationComplete();
                if (this.mIsDisposed) return
            }
        }
        var t;
        while ((t = this.mNetwork.Dequeue()) != null) {
            switch (t.Type) {
                case NetEventType.NewConnection:
                    if (this.mState == CallState.WaitingForIncomingCall || this.mConferenceMode && this.mState == CallState.InCall) {
                        if (this.mConferenceMode == false) this.mNetwork.StopServer();
                        this.mState = CallState.InCall;
                        this.mConnectionIds.push(t.ConnectionId.id);
                        this.TriggerCallEvent(new CallAcceptedEventArgs(t.ConnectionId));
                        if (this.mIsDisposed) return
                    } else if (this.mState == CallState.WaitingForOutgoingCall) {
                        this.mConnectionIds.push(t.ConnectionId.id);
                        this.mState = CallState.InCall;
                        this.TriggerCallEvent(new CallEventArgs(CallEventType.CallAccepted));
                        if (this.mIsDisposed) return
                    } else {
                        console.logWarning("Received incoming connection during invalid state " + this.mState)
                    }
                    break;
                case NetEventType.ConnectionFailed:
                    if (this.mState == CallState.WaitingForOutgoingCall) {
                        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ConnectionFailed));
                        if (this.mIsDisposed) return;
                        this.mState = CallState.Configured
                    } else {
                        console.log("Received ConnectionFailed during " + this.mState)
                    }
                    break;
                case NetEventType.Disconnected:
                    if (this.mConnectionIds.indexOf(t.ConnectionId.id) != -1) {
                        this.mConnectionIds.splice(t.ConnectionId.id, 1);
                        if (this.mConferenceMode == false && this.mConnectionIds.length == 0) {
                            this.mState = CallState.Closed
                        }
                        this.TriggerCallEvent(new CallEndedEventArgs(t.ConnectionId));
                        if (this.mIsDisposed) return
                    }
                    break;
                case NetEventType.ServerInitialized:
                    this.mServerInactive = false;
                    this.mState = CallState.WaitingForIncomingCall;
                    this.TriggerCallEvent(new WaitForIncomingCallEventArgs(t.Info));
                    if (this.mIsDisposed) return;
                    break;
                case NetEventType.ServerInitFailed:
                    this.mServerInactive = true;
                    this.mState = CallState.Configured;
                    this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ListeningFailed));
                    if (this.mIsDisposed) return;
                    break;
                case NetEventType.ServerClosed:
                    this.mServerInactive = true;
                    if (this.mState == CallState.WaitingForIncomingCall || this.mState == CallState.RequestingAddress) {
                        this.mState = CallState.Configured;
                        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ListeningFailed, CallErrorType.Unknown, "Server closed the connection while waiting for incoming calls."));
                        if (this.mIsDisposed) return
                    } else {}
                    break;
                case NetEventType.ReliableMessageReceived:
                    //var n = Encoding.UTF16.GetString(t.MessageData);
                    var n = byteArrayToString(t.MessageData);
                    this.TriggerCallEvent(new MessageEventArgs(t.ConnectionId, n));
                    if (this.mIsDisposed) return;
                    break
            }
        }
        var i = true;
        var r = true;
        if (i) {
            var o = this.mNetwork.TryGetFrame(ConnectionId.INVALID);
            if (o != null) {
                var a = new FrameUpdateEventArgs(ConnectionId.INVALID, o);
                this.TriggerCallEvent(a);
                if (this.mIsDisposed) return
            }
        }
        if (r) {
            for (var s = 0, l = this.mConnectionIds; s < l.length; s++) {
                var u = l[s];
                var c = this.mNetwork.TryGetFrame(new ConnectionId(u));
                if (c != null) {
                    var a = new FrameUpdateEventArgs(new ConnectionId(u), c);
                    this.TriggerCallEvent(a);
                    if (this.mIsDisposed) return
                }
            }
        }
        this.mNetwork.Flush()
    };
    e.prototype.PendingCall = function(e) {
        this.mPendingAddress = e;
        this.mPendingCallCall = true;
        this.mPendingListenCall = false
    };
    e.prototype.ProcessCall = function(e) {
        this.mState = CallState.WaitingForOutgoingCall;
        this.mNetwork.Connect(e);
        this.ClearPending()
    };
    e.prototype.PendingListen = function(e) {
        this.mPendingAddress = e;
        this.mPendingCallCall = false;
        this.mPendingListenCall = true
    };
    e.prototype.ProcessListen = function(e) {
        console.log("Listen at " + e);
        this.mServerInactive = false;
        this.mState = CallState.RequestingAddress;
        this.mNetwork.StartServer(e);
        this.ClearPending()
    };
    e.prototype.DoPending = function() {
        if (this.mPendingCallCall) {
            this.ProcessCall(this.mPendingAddress)
        } else if (this.mPendingListenCall) {
            this.ProcessListen(this.mPendingAddress)
        }
        this.ClearPending()
    };
    e.prototype.ClearPending = function() {
        this.mPendingAddress = null;
        this.mPendingCallCall = null;
        this.mPendingListenCall = null
    };
    e.prototype.CheckDisposed = function() {
        if (this.mIsDisposed) throw new InvalidOperationException("Object is disposed. No method calls possible.")
    };
    e.prototype.EnsureConfiguration = function() {
        if (this.mState == CallState.Initialized) {
            console.log("Use default configuration");
            this.Configure(new MediaConfig)
        } else {}
    };
    e.prototype.TriggerCallEvent = function(e) {
        var t = this.mCallEventHandlers.slice();
        for (var n = 0, i = t; n < i.length; n++) {
            var r = i[n];
            r(this, e)
        }
    };
    e.prototype.OnConfigurationComplete = function() {
        if (this.mIsDisposed) return;
        this.mState = CallState.Configured;
        console.log("Enter state CallState.Configured");
        this.TriggerCallEvent(new CallEventArgs(CallEventType.ConfigurationComplete));
        if (this.mIsDisposed == false) this.DoPending()
    };
    e.prototype.OnConfigurationFailed = function(e) {
        console.logWarning("Configuration failed: " + e);
        if (this.mIsDisposed) return;
        this.mState = CallState.Initialized;
        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ConfigurationFailed, CallErrorType.Unknown, e));
        if (this.mIsDisposed == false) this.ClearPending()
    };
    e.prototype.DisposeInternal = function(e) {
        if (!this.mIsDisposed) {
            if (e) {}
            this.mIsDisposed = true
        }
    };
    e.prototype.Dispose = function() {
        this.DisposeInternal(true)
    };
    return e
}();
var BrowserWebRtcCall = function(e) {
    __extends(t, e);

    function t(t) {
        e.call(this, t);
        this.Initialize(this.CreateNetwork())
    }
    t.prototype.CreateNetwork = function() {
        return new BrowserMediaNetwork(this.mNetworkConfig)
    };
    t.prototype.DisposeInternal = function(t) {
        e.prototype.DisposeInternal.call(this, t);
        if (t) {
            if (this.mNetwork != null) this.mNetwork.Dispose();
            this.mNetwork = null
        }
    };
    return t
}(AWebRtcCall);
var CallEventType;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["WaitForIncomingCall"] = 1] = "WaitForIncomingCall";
    e[e["CallAccepted"] = 2] = "CallAccepted";
    e[e["CallEnded"] = 3] = "CallEnded";
    e[e["FrameUpdate"] = 4] = "FrameUpdate";
    e[e["Message"] = 5] = "Message";
    e[e["ConnectionFailed"] = 6] = "ConnectionFailed";
    e[e["ListeningFailed"] = 7] = "ListeningFailed";
    e[e["ConfigurationComplete"] = 8] = "ConfigurationComplete";
    e[e["ConfigurationFailed"] = 9] = "ConfigurationFailed"
})(CallEventType || (CallEventType = {}));
var CallEventArgs = function() {
    function e(e) {
        this.mType = CallEventType.Invalid;
        this.mType = e
    }
    Object.defineProperty(e.prototype, "Type", {
        get: function() {
            return this.mType
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
var CallAcceptedEventArgs = function(e) {
    __extends(t, e);

    function t(t) {
        e.call(this, CallEventType.CallAccepted);
        this.mConnectionId = ConnectionId.INVALID;
        this.mConnectionId = t
    }
    Object.defineProperty(t.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var CallEndedEventArgs = function(e) {
    __extends(t, e);

    function t(t) {
        e.call(this, CallEventType.CallEnded);
        this.mConnectionId = ConnectionId.INVALID;
        this.mConnectionId = t
    }
    Object.defineProperty(t.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var CallErrorType;
(function(e) {
    e[e["Unknown"] = 0] = "Unknown"
})(CallErrorType || (CallErrorType = {}));
var ErrorEventArgs = function(e) {
    __extends(t, e);

    function t(t, n, i) {
        e.call(this, t);
        this.mErrorType = CallErrorType.Unknown;
        this.mErrorType = n;
        this.mErrorMessage = i;
        if (this.mErrorMessage == null) {
            switch (t) {
                case CallEventType.ConnectionFailed:
                    this.mErrorMessage = "Connection failed.";
                    break;
                case CallEventType.ListeningFailed:
                    this.mErrorMessage = "Failed to allow incoming connections. Address already in use or server connection failed.";
                    break;
                default:
                    this.mErrorMessage = "Unknown error.";
                    break
            }
        }
    }
    Object.defineProperty(t.prototype, "ErrorMessage", {
        get: function() {
            return this.mErrorMessage
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "ErrorType", {
        get: function() {
            return this.mErrorType
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var WaitForIncomingCallEventArgs = function(e) {
    __extends(t, e);

    function t(t) {
        e.call(this, CallEventType.WaitForIncomingCall);
        this.mAddress = t
    }
    Object.defineProperty(t.prototype, "Address", {
        get: function() {
            return this.mAddress
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var FramePixelFormat;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["Format32bppargb"] = 1] = "Format32bppargb"
})(FramePixelFormat || (FramePixelFormat = {}));
var MessageEventArgs = function(e) {
    __extends(t, e);

    function t(t, n) {
        e.call(this, CallEventType.Message);
        this.mConnectionId = ConnectionId.INVALID;
        this.mConnectionId = t;
        this.mAddress = n
    }
    Object.defineProperty(t.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Content", {
        get: function() {
            return this.mAddress
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var FrameUpdateEventArgs = function(e) {
    __extends(t, e);

    function t(t, n) {
        e.call(this, CallEventType.FrameUpdate);
        this.mConnectionId = ConnectionId.INVALID;
        this.mTrackId = 0;
        this.mFormat = FramePixelFormat.Format32bppargb;
        this.mConnectionId = t;
        this.mFrame = n
    }
    Object.defineProperty(t.prototype, "Format", {
        get: function() {
            return this.mFormat
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "TrackId", {
        get: function() {
            return this.mTrackId
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "IsRemote", {
        get: function() {
            return this.mConnectionId.id != ConnectionId.INVALID.id
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Frame", {
        get: function() {
            return this.mFrame
        },
        enumerable: true,
        configurable: true
    });
    return t
}(CallEventArgs);
var MediaConfigurationState;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["NoConfiguration"] = 1] = "NoConfiguration";
    e[e["InProgress"] = 2] = "InProgress";
    e[e["Successful"] = 3] = "Successful";
    e[e["Failed"] = 4] = "Failed"
})(MediaConfigurationState || (MediaConfigurationState = {}));
var MediaConfig = function() {
    function e() {
        this.mAudio = true;
        this.mVideo = true;
        this.mMinWidth = -1;
        this.mMinHeight = -1;
        this.mMaxWidth = -1;
        this.mMaxHeight = -1;
        this.mIdealWidth = -1;
        this.mIdealHeight = -1
    }
    Object.defineProperty(e.prototype, "Audio", {
        get: function() {
            return this.mAudio
        },
        set: function(e) {
            this.mAudio = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "Video", {
        get: function() {
            return this.mVideo
        },
        set: function(e) {
            this.mVideo = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "MinWidth", {
        get: function() {
            return this.mMinWidth
        },
        set: function(e) {
            this.mMinWidth = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "MinHeight", {
        get: function() {
            return this.mMinHeight
        },
        set: function(e) {
            this.mMinHeight = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "MaxWidth", {
        get: function() {
            return this.mMaxWidth
        },
        set: function(e) {
            this.mMaxWidth = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "MaxHeight", {
        get: function() {
            return this.mMaxHeight
        },
        set: function(e) {
            this.mMaxHeight = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "IdealWidth", {
        get: function() {
            return this.mIdealWidth
        },
        set: function(e) {
            this.mIdealWidth = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "IdealHeight", {
        get: function() {
            return this.mIdealHeight
        },
        set: function(e) {
            this.mIdealHeight = e
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
var NetworkConfig = function() {
    function e() {
    
      this.mIceServers = [{
        'urls':'turn: remotesupport.northeurope.cloudapp.azure.com',
        'username': 'remotesupport',
        'credential': 'h0lolens'
        }];
     
        //this.mSignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777/callapp";
        this.mSignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";
        this.mIsConference = false
    }
    Object.defineProperty(e.prototype, "IceServers", {
        get: function() {
            return this.mIceServers
        },
        set: function(e) {
            this.mIceServers = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "SignalingUrl", {
        get: function() {
            return this.mSignalingUrl
        },
        set: function(e) {
            this.mSignalingUrl = e
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "IsConference", {
        get: function() {
            return this.mIsConference
        },
        set: function(e) {
            this.mIsConference = e
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
var IFrameData = function() {
    function e() {}
    Object.defineProperty(e.prototype, "Buffer", {
        get: function() {
            return null
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "Width", {
        get: function() {
            return -1
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "Height", {
        get: function() {
            return -1
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
var RawFrame = function(e) {
    __extends(t, e);

    function t(t, n, i) {
        e.call(this);
        this.mBuffer = null;
        this.mBuffer = t;
        this.mWidth = n;
        this.mHeight = i
    }
    Object.defineProperty(t.prototype, "Buffer", {
        get: function() {
            return this.mBuffer
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Width", {
        get: function() {
            return this.mWidth
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Height", {
        get: function() {
            return this.mHeight
        },
        enumerable: true,
        configurable: true
    });
    return t
}(IFrameData);
var LazyFrame = function(e) {
    __extends(t, e);

    function t(t) {
        e.call(this);
        this.mFrameGenerator = t
    }
    Object.defineProperty(t.prototype, "FrameGenerator", {
        get: function() {
            return this.mFrameGenerator
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Buffer", {
        get: function() {
            this.GenerateFrame();
            if (this.mRawFrame == null) return null;
            return this.mRawFrame.Buffer
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Width", {
        get: function() {
            this.GenerateFrame();
            if (this.mRawFrame == null) return -1;
            return this.mRawFrame.Width
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "Height", {
        get: function() {
            this.GenerateFrame();
            if (this.mRawFrame == null) return -1;
            return this.mRawFrame.Height
        },
        enumerable: true,
        configurable: true
    });
    t.prototype.GenerateFrame = function() {
        if (this.mRawFrame == null) {
            try {
                this.mRawFrame = this.mFrameGenerator.CreateFrame()
            } catch (e) {
                this.mRawFrame = null;
                console.warn("frame skipped in GenerateFrame due to exception: " + JSON.stringify(e))
            }
        }
    };
    return t
}(IFrameData);
var BrowserMediaNetwork = function(e) {
    __extends(t, e);

    function t(n) {
        e.call(this, t.BuildSignalingConfig(n.SignalingUrl), t.BuildRtcConfig(n.IceServers));
        this.mNetworkConfig = null;
        this.mConfigurationState = MediaConfigurationState.Invalid;
        this.mConfigurationError = null;
        this.mMediaConfig = null;
        this.mLocalFrameBuffer = null;
        this.mConfigurationState = MediaConfigurationState.NoConfiguration
    }
    t.prototype.Configure = function(e) {
        var n = this;
        this.mMediaConfig = e;
        this.mConfigurationError = null;
        this.mConfigurationState = MediaConfigurationState.InProgress;
        if (e.Audio || e.Video) {
            var i = {
                video: e.Video,
                audio: e.Audio,
                width: {
                    ideal: 320
                },
                height: {
                    ideal: 240
                }
            };
            if (e.MinWidth != -1) i.width.min = e.MinWidth;
            if (e.MinHeight != -1) i.height.min = e.MinHeight;
            if (e.MaxWidth != -1) i.width.max = e.MaxWidth;
            if (e.MaxHeight != -1) i.height.max = e.MaxHeight;
            if (e.IdealWidth != -1) i.width.ideal = e.IdealWidth;
            if (e.IdealHeight != -1) i.height.ideal = e.IdealHeight;
            console.log("calling CallGetUserMedia");
            t.CallGetUserMedia(i).then(function(e) {
                n.mLocalFrameBuffer = new FrameBuffer(e);
                n.mLocalFrameBuffer.SetMute(true);
                n.OnConfigurationSuccess()
            }).catch(function(e) {
                console.debug(e.name + ": " + e.message);
                n.OnConfigurationFailed(e.message)
            })
        } else {
            this.OnConfigurationSuccess()
        }
    };
    t.prototype.Update = function() {
        e.prototype.Update.call(this);
        if (this.mLocalFrameBuffer != null) this.mLocalFrameBuffer.Update()
    };
    t.prototype.GetConfigurationState = function() {
        return this.mConfigurationState
    };
    t.prototype.GetConfigurationError = function() {
        return this.mConfigurationError
    };
    t.prototype.ResetConfiguration = function() {
        this.mConfigurationState = MediaConfigurationState.NoConfiguration;
        this.mMediaConfig = new MediaConfig;
        this.mConfigurationError = null
    };
    t.prototype.OnConfigurationSuccess = function() {
        this.mConfigurationState = MediaConfigurationState.Successful
    };
    t.prototype.OnConfigurationFailed = function(e) {
        this.mConfigurationError = e;
        this.mConfigurationState = MediaConfigurationState.Failed
    };
    t.prototype.PeekFrame = function(e) {
        if (e == null) return;
        if (e.id == ConnectionId.INVALID.id) {
            if (this.mLocalFrameBuffer != null) {
                return this.mLocalFrameBuffer.PeekFrame()
            }
        } else {
            var t = this.IdToConnection[e.id];
            if (t != null) {
                return t.PeekFrame()
            }
        }
        return null
    };
    t.prototype.TryGetFrame = function(e) {
        if (e == null) return;
        if (e.id == ConnectionId.INVALID.id) {
            if (this.mLocalFrameBuffer != null) {
                return this.mLocalFrameBuffer.TryGetFrame()
            }
        } else {
            var t = this.IdToConnection[e.id];
            if (t != null) {
                return t.TryGetRemoteFrame()
            }
        }
        return null
    };
    t.prototype.SetVolume = function(e, t) {
        console.log("SetVolume called. Volume: " + e + " id: " + t.id);
        var n = this.IdToConnection[t.id];
        if (n != null) {
            return n.SetVolume(e)
        }
    };
    t.prototype.HasAudioTrack = function(e) {
        var t = this.IdToConnection[e.id];
        if (t != null) {
            return t.HasAudioTrack()
        }
        return false
    };
    t.prototype.HasVideoTrack = function(e) {
        var t = this.IdToConnection[e.id];
        if (t != null) {
            return t.HasVideoTrack()
        }
        return false
    };
    t.prototype.CreatePeer = function(e, t) {
        var n = new MediaPeer(e, t);
        if (this.mLocalFrameBuffer != null) n.AddLocalStream(this.mLocalFrameBuffer.Stream);
        return n
    };
    t.prototype.DisposeInternal = function() {
        e.prototype.DisposeInternal.call(this);
        this.DisposeLocalStream()
    };
    t.prototype.DisposeLocalStream = function() {
        if (this.mLocalFrameBuffer != null) {
            this.mLocalFrameBuffer.Dispose();
            this.mLocalFrameBuffer = null;
            console.log("local buffer disposed")
        }
    };
    t.BuildSignalingConfig = function(e) {
        return new SignalingConfig(new WebsocketNetwork(e));
    };
    t.BuildRtcConfig = function(e) {
        var t = {
            iceServers: e
        };
        return t
    };
    t.CallGetUserMedia = function(e) {
        var t = function(e) {
            var t = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            if (!t) {
                return Promise.reject(new Error("getUserMedia is not implemented in this browser"))
            }
            return new Promise(function(n, i) {
                t.call(navigator, e, n, i)
            })
        };
        var n = null;
        if (navigator.mediaDevices == null || navigator.mediaDevices.getUserMedia == null) {
            n = t
        } else {
            n = function(e) {
                return navigator.mediaDevices.getUserMedia(e)
            }
        }
        return n(e)
    };
    return t
}(WebRtcNetwork);

var FrameBuffer = function() {
    function e(e) {
        this.mBufferedFrame = null;
        this.mCanvasElement = null;
        this.mIsActive = false;
        this.mMsPerFrame = 1 / 30 * 1e3;
        this.mLastFrame = 0;
        this.mHasVideo = false;
        this.mStream = e;
        if (this.mStream.getVideoTracks().length > 0) this.mHasVideo = true;
        this.SetupElements()
    }
    Object.defineProperty(e.prototype, "Stream", {
        get: function() {
            return this.mStream
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "VideoElement", {
        get: function() {
            return this.mVideoElement
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.SetupElements = function() {
        var e = this;
        this.mVideoElement = this.SetupVideoElement();
        this.mVideoElement.onloadedmetadata = function(t) {
            e.mVideoElement.play();
            if (e.mHasVideo) {
                e.mCanvasElement = e.SetupCanvas();
                if (e.mCanvasElement == null) e.mHasVideo = false
            } else {
                e.mCanvasElement = null
            }
            e.mIsActive = true
        };
        var t = window.URL.createObjectURL(this.mStream);
        this.mVideoElement.src = t
    };
    e.prototype.TryGetFrame = function() {
        var e = this.mBufferedFrame;
        this.mBufferedFrame = null;
        return e
    };
    e.prototype.SetMute = function(e) {
        this.mVideoElement.muted = e
    };
    e.prototype.PeekFrame = function() {
        return this.mBufferedFrame
    };
    e.prototype.Update = function() {
        if (this.mIsActive && this.mHasVideo && this.mCanvasElement != null) {
            var e = (new Date).getTime();
            var t = e - this.mLastFrame;
            if (t >= this.mMsPerFrame) {
                this.mLastFrame = e;
                this.FrameToBuffer()
            }
        }
    };
    e.prototype.Dispose = function() {
        this.mIsActive = false;
        if (this.mCanvasElement != null && this.mCanvasElement.parentElement != null) {
            this.mCanvasElement.parentElement.removeChild(this.mCanvasElement)
        }
        if (this.mVideoElement != null && this.mVideoElement.parentElement != null) {
            this.mVideoElement.parentElement.removeChild(this.mVideoElement)
        }
        var e = this.mStream.getVideoTracks();
        for (var t = 0; t < e.length; t++) {
            e[t].stop()
        }
        var n = this.mStream.getAudioTracks();
        for (var t = 0; t < n.length; t++) {
            n[t].stop()
        }
        this.mStream = null;
        this.mVideoElement = null;
        this.mCanvasElement = null
    };
    e.prototype.CreateFrame = function() {
        var e = this.mCanvasElement.getContext("2d");
        var t = true;
        if (t) {
            e.clearRect(0, 0, this.mCanvasElement.width, this.mCanvasElement.height)
        }
        e.drawImage(this.mVideoElement, 0, 0);
        try {
            var n = e.getImageData(0, 0, this.mCanvasElement.width, this.mCanvasElement.height);
            var i = n.data;
            var r = new Uint8Array(i.buffer);
            return new RawFrame(r, this.mCanvasElement.width, this.mCanvasElement.height)
        } catch (e) {FrameBuffer
            var r = new Uint8Array(this.mCanvasElement.width * this.mCanvasElement.height * 4);
            r.fill(255, 0, r.length - 1);
            return new RawFrame(r, this.mCanvasElement.width, this.mCanvasElement.height)
        }
    };
    e.prototype.FrameToBuffer = function() {
        if (e.sUseLazyFrames) {
            this.mBufferedFrame = new LazyFrame(this)
        } else {
            try {
                this.mBufferedFrame = this.CreateFrame()
            } catch (e) {
                this.mBufferedFrame = null;
                console.warn("frame skipped due to exception: " + JSON.stringify(e))
            }
        }
    };
    e.prototype.SetupVideoElement = function() {
        var t = document.createElement("video");
        t.width = 320;
        t.height = 240;
        t.controls = true;
        if (e.DEBUG_SHOW_ELEMENTS) document.body.appendChild(t);
        return t
    };
    e.prototype.SetupCanvas = function() {
        if (this.mVideoElement == null || this.mVideoElement.videoWidth <= 0 || this.mVideoElement.videoHeight <= 0) return null;
        var t = document.createElement("canvas");
        t.width = this.mVideoElement.videoWidth;
        t.height = this.mVideoElement.videoHeight;
        if (e.DEBUG_SHOW_ELEMENTS) document.body.appendChild(t);
        return t
    };
    e.prototype.SetVolume = function(e) {
        if (this.mVideoElement == null) {
            return
        }
        if (e < 0) e = 0;
        if (e > 1) e = 1;
        this.mVideoElement.volume = e
    };
    e.prototype.HasAudioTrack = function() {
        if (this.mStream != null && this.mStream.getAudioTracks() != null && this.mStream.getAudioTracks().length > 0) {
            return true
        }
        return false
    };
    e.prototype.HasVideoTrack = function() {
        if (this.mStream != null && this.mStream.getVideoTracks() != null && this.mStream.getVideoTracks().length > 0) {
            return true
        }
        return false
    };
    e.DEBUG_SHOW_ELEMENTS = false;
    e.sUseLazyFrames = false;
    return e
}();
var MediaPeer = function(e) {
    __extends(t, e);

    function t() {
        e.apply(this, arguments);
        this.mBuffer = null
    }
    t.prototype.OnSetup = function() {
        var t = this;
        e.prototype.OnSetup.call(this);
        this.mOfferOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        };
        this.mPeer.onaddstream = function(e) {
            t.OnAddStream(e)
        }
    };
    t.prototype.OnCleanup = function() {
        e.prototype.OnCleanup.call(this);
        if (this.mBuffer != null) {
            this.mBuffer.Dispose();
            this.mBuffer = null;
            console.log("MediaPeer buffer disposed")
        }
    };
    t.prototype.OnAddStream = function(e) {
        this.mBuffer = new FrameBuffer(e.stream)
    };
    t.prototype.TryGetRemoteFrame = function() {
        if (this.mBuffer == null) return null;
        return this.mBuffer.TryGetFrame()
    };
    t.prototype.PeekFrame = function() {
        if (this.mBuffer == null) return null;
        return this.mBuffer.PeekFrame()
    };
    t.prototype.AddLocalStream = function(e) {
        this.mPeer.addStream(e)
    };
    t.prototype.Update = function() {
        e.prototype.Update.call(this);
        if (this.mBuffer != null) {
            this.mBuffer.Update()
        }
    };
    t.prototype.SetVolume = function(e) {
        if (this.mBuffer != null) this.mBuffer.SetVolume(e)
    };
    t.prototype.HasAudioTrack = function() {
        if (this.mBuffer != null) return this.mBuffer.HasAudioTrack();
        return false
    };
    t.prototype.HasVideoTrack = function() {
        if (this.mBuffer != null) return this.mBuffer.HasVideoTrack();
        return false
    };
    return t
}(WebRtcDataPeer);

function getParameterByName(e, t) {
    if (!t) t = window.location.href;
    e = e.replace(/[\[\]]/g, "\\$&");
    var n = new RegExp("[?&]" + e + "(=([^&#]*)|&|#|$)"),
        i = n.exec(t);
    if (!i) return null;
    if (!i[2]) return "";
    return decodeURIComponent(i[2].replace(/\+/g, " "))
}

function GetRandomKey() {
    var e = "";
    for (var t = 0; t < 7; t++) {
        e += String.fromCharCode(65 + Math.round(Math.random() * 25))
    }
    return e
}

var Encoder = function() {
    function e() {}
    return e
}();
var UTF16Encoding = function(e) {
    __extends(t, e);

    function t() {
        e.call(this)
    }
    t.prototype.GetBytes = function(e) {
        return this.stringToBuffer(e)
    };
    t.prototype.GetString = function(e) {
        return this.bufferToString(e)
    };
    t.prototype.bufferToString = function(e) {
        var t = new Uint16Array(e.buffer, e.byteOffset, e.byteLength / 2);
        return String.fromCharCode.apply(null, t)
    };
    t.prototype.stringToBuffer = function(e) {
        var t = new ArrayBuffer(e.length * 2);
        var n = new Uint16Array(t);
        for (var i = 0, r = e.length; i < r; i++) {
            n[i] = e.charCodeAt(i)
        }
        var o = new Uint8Array(t);
        return o
    };
    return t
}(Encoder);
var Encoding = function() {
    function e() {}
    Object.defineProperty(e, "UTF16", {
        get: function() {
            return new UTF16Encoding
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
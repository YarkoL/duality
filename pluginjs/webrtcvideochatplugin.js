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
        SLog.Log("Enter state CallState.Configuring");
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
        SLog.Log("Call to " + e);
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
        for (var n = 0, i = this.mConnectionIds; n < i.length; n++) {
            var r = i[n];
            SLog.L("Send message to " + r + "! " + e);
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
                        SLog.LogWarning("Received incoming connection during invalid state " + this.mState)
                    }
                    break;
                case NetEventType.ConnectionFailed:
                    if (this.mState == CallState.WaitingForOutgoingCall) {
                        this.TriggerCallEvent(new ErrorEventArgs(CallEventType.ConnectionFailed));
                        if (this.mIsDisposed) return;
                        this.mState = CallState.Configured
                    } else {
                        SLog.LogError("Received ConnectionFailed during " + this.mState)
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
                    var n = Encoding.UTF16.GetString(t.MessageData);
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
        SLog.Log("Listen at " + e);
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
            SLog.Log("Use default configuration");
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
        SLog.Log("Enter state CallState.Configured");
        this.TriggerCallEvent(new CallEventArgs(CallEventType.ConfigurationComplete));
        if (this.mIsDisposed == false) this.DoPending()
    };
    e.prototype.OnConfigurationFailed = function(e) {
        SLog.LogWarning("Configuration failed: " + e);
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
        this.mIceServers = new Array;
        this.mSignalingUrl = "ws://because-why-not.com:12776";
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
        var t;
        if (e == null || e == "") {
            t = new LocalNetwork
        } else {
            t = new WebsocketNetwork(e)
        }
        return new SignalingConfig(t)
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

function CAPIMediaNetwork_IsAvailable() {
    if (typeof CAPIWebRtcNetworkIsAvailable === "function" && CAPIWebRtcNetworkIsAvailable()) return true;
    return false
}

function CAPIMediaNetwork_Create(e) {
    var t = new NetworkConfig;
    t = JSON.parse(e);
    var n = new BrowserMediaNetwork(t);
    var i = gCAPIWebRtcNetworkInstancesNextIndex;
    gCAPIWebRtcNetworkInstancesNextIndex++;
    gCAPIWebRtcNetworkInstances[i] = n;
    return i
}

function CAPIMediaNetwork_Configure(e, t, n, i, r, o, a, s, l) {
    var u = new MediaConfig;
    u.Audio = t;
    u.Video = n;
    u.MinWidth = i;
    u.MinHeight = r;
    u.MaxWidth = o;
    u.MaxHeight = a;
    u.IdealWidth = s;
    u.IdealHeight = l;
    var c = gCAPIWebRtcNetworkInstances[e];
    c.Configure(u)
}

function CAPIMediaNetwork_GetConfigurationState(e) {
    var t = gCAPIWebRtcNetworkInstances[e];
    return t.GetConfigurationState()
}

function CAPIMediaNetwork_GetConfigurationError(e) {
    var t = gCAPIWebRtcNetworkInstances[e];
    return t.GetConfigurationError()
}

function CAPIMediaNetwork_ResetConfiguration(e) {
    var t = gCAPIWebRtcNetworkInstances[e];
    return t.ResetConfiguration()
}

function CAPIMediaNetwork_TryGetFrame(e, t, n, i, r, o, a, s, l) {
    var u = gCAPIWebRtcNetworkInstances[e];
    var c = u.TryGetFrame(new ConnectionId(t));
    if (c == null || c.Buffer == null) {
        return false
    } else {
        n[i] = c.Width;
        r[o] = c.Height;
        for (var f = 0; f < l && f < c.Buffer.length; f++) {
            a[s + f] = c.Buffer[f]
        }
        return true
    }
}

function CAPIMediaNetwork_TryGetFrameDataLength(e, t) {
    var n = gCAPIWebRtcNetworkInstances[e];
    var i = n.PeekFrame(new ConnectionId(t));
    var r = -1;
    if (i != null && i.Buffer != null) {
        r = i.Buffer.length
    }
    return r
}

function CAPIMediaNetwork_SetVolume(e, t, n) {
    var i = gCAPIWebRtcNetworkInstances[e];
    i.SetVolume(t, new ConnectionId(n))
}

function CAPIMediaNetwork_HasAudioTrack(e, t) {
    var n = gCAPIWebRtcNetworkInstances[e];
    return n.HasAudioTrack(new ConnectionId(t))
}

function CAPIMediaNetwork_HasVideoTrack(e, t) {
    var n = gCAPIWebRtcNetworkInstances[e];
    return n.HasVideoTrack(new ConnectionId(t))
}

function CAPIMediaNetwork_test1() {
    FrameBuffer.DEBUG_SHOW_ELEMENTS = true;
    var e = CAPIMediaNetwork_Create('{"IceUrls":["stun:stun.l.google.com:19302"], "SignalingUrl":"ws://because-why-not.com:12776"}');
    var t = false;
    CAPIMediaNetwork_Configure(e, true, true, 160, 120, 640, 480, 640, 480);
    console.log(CAPIMediaNetwork_GetConfigurationState(e));
    var n = (new Date).getTime();
    var i = function() {
        CAPIWebRtcNetworkUpdate(e);
        if (CAPIMediaNetwork_GetConfigurationState(e) == MediaConfigurationState.Successful && t == false) {
            t = true;
            console.log("configuration done")
        }
        if (CAPIMediaNetwork_GetConfigurationState(e) == MediaConfigurationState.Failed) {
            alert("configuration failed")
        }
        if (t == false) console.log(CAPIMediaNetwork_GetConfigurationState(e));
        if ((new Date).getTime() - n < 15e3) {
            window.requestAnimationFrame(i)
        } else {
            console.log("shutting down");
            CAPIWebRtcNetworkRelease(e)
        }
    };
    window.requestAnimationFrame(i)
}
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
        } catch (e) {
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

function BrowserMediaNetwork_TestLocalCamera() {
    FrameBuffer.DEBUG_SHOW_ELEMENTS = true;
    var e = new NetworkConfig;
    e.SignalingUrl = null;
    var t = new BrowserMediaNetwork(e);
    var n = new MediaConfig;
    n.Audio = true;
    n.Video = true;
    t.Configure(n);
    setInterval(function() {
        t.Update();
        var e = t.TryGetFrame(ConnectionId.INVALID);
        console.log("width" + e.Width + " height:" + e.Height + " data:" + e.Buffer[0]);
        t.Flush()
    }, 50)
}

function BrowserMediaNetwork_Test2() {
    FrameBuffer.DEBUG_SHOW_ELEMENTS = true;
    var e = new NetworkConfig;
    e.SignalingUrl = "ws://because-why-not.com:12776/testshared";
    var t = new BrowserMediaNetwork(e);
    var n = new BrowserMediaNetwork(e);
    var i = new MediaConfig;
    i.Audio = true;
    i.Video = true;
    setTimeout(function() {
        t.Configure(i)
    }, 5e3);
    setTimeout(function() {
        console.log("connecting network1");
        t.StartServer("ts");
        if (n != null) n.Configure(i)
    }, 1e4);
    setTimeout(function() {
        if (n != null) {
            console.log("connecting network2");
            n.StartServer("ts")
        }
    }, 15e3);
    var r = null;
    var o = null;
    setInterval(function() {
        t.Update();
        var e = null;
        var i = null;
        e = t.TryGetFrame(ConnectionId.INVALID);
        if (e != null) console.log("local1 width" + e.Width + " height:" + e.Height + " data:" + e.Buffer[0]);
        var a;
        while ((a = t.Dequeue()) != null) {
            console.log("network1: " + a.toString());
            if (a.Type == NetEventType.NewConnection) {
                r = a.ConnectionId
            }
        }
        if (r != null) {
            e = t.TryGetFrame(r);
            if (e != null) console.log("remote1 width" + e.Width + " height:" + e.Height + " data:" + e.Buffer[0])
        }
        t.Flush();
        if (n == null) return;
        n.Update();
        i = n.TryGetFrame(ConnectionId.INVALID);
        if (i != null) console.log("local2 width" + i.Width + " height:" + i.Height + " data:" + i.Buffer[0]);
        while ((a = n.Dequeue()) != null) {
            console.log("network2: " + a.toString());
            if (a.Type == NetEventType.NewConnection) {
                o = a.ConnectionId
            }
        }
        if (o != null) {
            i = n.TryGetFrame(o);
            if (i != null) console.log("remote2 width" + i.Width + " height:" + i.Height + " data:" + i.Buffer[0])
        }
        n.Flush()
    }, 50)
}

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

function BrowserWebRtcCall_Test1() {
    console.log("start");
    FrameBuffer.sUseLazyFrames = true;
    var e = new NetworkConfig;
    e.IsConference = true;
    e.SignalingUrl = "wss://because-why-not.com:12777/testshared";
    console.log("Using secure connection " + e.SignalingUrl);
    var t = getParameterByName("a");
    if (t == null) {
        t = GetRandomKey();
        window.location.href = window.location.href + "?a=" + t;
        return
    }
    var n = new BrowserWebRtcCall(e);
    var i = null;
    var r = {};
    n.addEventListener(function(o, a) {
        if (a.Type == CallEventType.ConfigurationComplete) {
            console.log("configuration complete")
        } else if (a.Type == CallEventType.FrameUpdate) {
            var s = a;
            if (i == null && s.ConnectionId == ConnectionId.INVALID) {
                var l = document.createElement("br");
                document.body.appendChild(l);
                console.log("local video added");
                var u = s.Frame;
                i = u.FrameGenerator.VideoElement;
                document.body.appendChild(i)
            } else if (s.ConnectionId != ConnectionId.INVALID && r[s.ConnectionId.id] == null) {
                console.log("remote video added");
                var u = s.Frame;
                r[s.ConnectionId.id] = u.FrameGenerator.VideoElement;
                document.body.appendChild(r[s.ConnectionId.id]);
                var l = document.createElement("br");
                document.body.appendChild(l)
            }
        } else if (a.Type == CallEventType.ListeningFailed) {
            if (e.IsConference == false) {
                n.Call(t)
            } else {
                console.error("Listening failed. Server dead?")
            }
        } else if (a.Type == CallEventType.ConnectionFailed) {
            alert("connection failed")
        } else if (a.Type == CallEventType.CallEnded) {
            var c = a;
            console.log("call ended with id " + c.ConnectionId.id);
            r[c.ConnectionId.id] = null
        } else {
            console.log(a.Type)
        }
    });
    setInterval(function() {
        n.Update()
    }, 50);
    var o = new MediaConfig;
    n.Configure(o);
    n.Listen(t)
}

//from here onwards, identical with webrtcnetworkplugin

var gCAPIWebRtcNetworkInstances = {};
var gCAPIWebRtcNetworkInstancesNextIndex = 1;

function CAPIWebRtcNetworkIsAvailable() {
    if (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection) return true;
    return false
}

function CAPIWebRtcNetworkCreate(e) {
    console.debug("CAPIWebRtcNetworkCreate called");
    var t = gCAPIWebRtcNetworkInstancesNextIndex;
    gCAPIWebRtcNetworkInstancesNextIndex++;
    var n = "LocalNetwork";
    var i = null;
    var r;
    if (e == null || typeof e !== "string" || e.length === 0) {
        console.error("invalid configuration. Returning -1! Config: " + e);
        return -1
    } else {
        console.debug("parsing configuration");
        var o = JSON.parse(e);
        if (o) {
            if (o.signaling) {
                n = o.signaling.class;
                i = o.signaling.param
            }
            if (o.iceServers) {
                r = o.iceServers
            }
            var a = window[n];
            var s = new SignalingConfig(new a(i));
            console.debug("setup webrtc network");
            var l = {
                iceServers: r
            };
            gCAPIWebRtcNetworkInstances[t] = new WebRtcNetwork(s, l)
        } else {
            console.error("Parsing configuration failed. Configuration: " + e);
            return -1
        }
    }
    return t
}

function CAPIWebRtcNetworkRelease(e) {
    if (e in gCAPIWebRtcNetworkInstances) {
        gCAPIWebRtcNetworkInstances[e].Dispose();
        delete gCAPIWebRtcNetworkInstances[e]
    }
}

function CAPIWebRtcNetworkConnect(e, t) {
    return gCAPIWebRtcNetworkInstances[e].Connect(t)
}

function CAPIWebRtcNetworkStartServer(e, t) {
    gCAPIWebRtcNetworkInstances[e].StartServer(t)
}

function CAPIWebRtcNetworkStopServer(e) {
    gCAPIWebRtcNetworkInstances[e].StopServer()
}

function CAPIWebRtcNetworkDisconnect(e, t) {
    gCAPIWebRtcNetworkInstances[e].Disconnect(new ConnectionId(t))
}

function CAPIWebRtcNetworkShutdown(e) {
    gCAPIWebRtcNetworkInstances[e].Shutdown()
}

function CAPIWebRtcNetworkUpdate(e) {
    gCAPIWebRtcNetworkInstances[e].Update()
}

function CAPIWebRtcNetworkFlush(e) {
    gCAPIWebRtcNetworkInstances[e].Flush()
}

function CAPIWebRtcNetworkSendData(e, t, n, i) {
    gCAPIWebRtcNetworkInstances[e].SendData(new ConnectionId(t), n, i)
}

function CAPIWebRtcNetworkSendDataEm(e, t, n, i, r, o) {
    console.debug("SendDataEm: " + o + " length " + r + " to " + t);
    var a = new Uint8Array(n.buffer, i, r);
    gCAPIWebRtcNetworkInstances[e].SendData(new ConnectionId(t), a, o)
}

function CAPIWebRtcNetworkDequeue(e) {
    return gCAPIWebRtcNetworkInstances[e].Dequeue()
}

function CAPIWebRtcNetworkPeek(e) {
    return gCAPIWebRtcNetworkInstances[e].Peek()
}

function CAPIWebRtcNetworkPeekEventDataLength(e) {
    var t = gCAPIWebRtcNetworkInstances[e].Peek();
    return CAPIWebRtcNetworkCheckEventLength(t)
}

function CAPIWebRtcNetworkCheckEventLength(e) {
    if (e == null) {
        return -1
    } else if (e.RawData == null) {
        return 0
    } else if (typeof e.RawData === "string") {
        return e.RawData.length
    } else {
        return e.RawData.length
    }
}

function CAPIWebRtcNetworkEventDataToUint8Array(e, t, n, i) {
    if (e == null) {
        return 0
    } else if (typeof e === "string") {
        var r = 0;
        for (r = 0; r < e.length && r < i; r++) {
            t[n + r] = e.charCodeAt(r)
        }
        return r
    } else {
        var r = 0;
        for (r = 0; r < e.length && r < i; r++) {
            t[n + r] = e[r]
        }
        return r
    }
}

function CAPIWebRtcNetworkDequeueEm(e, t, n, i, r, o, a, s, l, u) {
    var c = CAPIWebRtcNetworkDequeue(e);
    if (c == null) return false;
    t[n] = c.Type;
    i[r] = c.ConnectionId.id;
    var f = CAPIWebRtcNetworkEventDataToUint8Array(c.RawData, o, a, s);
    l[u] = f;
    return true
}

function CAPIWebRtcNetworkPeekEm(e, t, n, i, r, o, a, s, l, u) {
    var c = CAPIWebRtcNetworkPeek(e);
    if (c == null) return false;
    t[n] = c.Type;
    i[r] = c.ConnectionId.id;
    var f = CAPIWebRtcNetworkEventDataToUint8Array(c.RawData, o, a, s);
    l[u] = f;
    return true
}
var DefaultValues = function() {
    function e() {}
    Object.defineProperty(e, "DefaultIceServers", {
        get: function() {
            return e.mDefaultIceServer
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e, "DefaultSignalingServer", {
        get: function() {
            return e.mDefaultSignalingServer
        },
        enumerable: true,
        configurable: true
    });
    e.mDefaultIceServer = ["stun:stun.l.google.com:19302"];
    e.mDefaultSignalingServer = "wss://because-why-not.com:12777";
    return e
}();
var Queue = function() {
    function e() {
        this.mArr = new Array
    }
    e.prototype.Enqueue = function(e) {
        this.mArr.push(e)
    };
    e.prototype.TryDequeue = function(e) {
        var t = false;
        if (this.mArr.length > 0) {
            e.val = this.mArr.shift();
            t = true
        }
        return t
    };
    e.prototype.Dequeue = function() {
        if (this.mArr.length > 0) {
            return this.mArr.shift()
        } else {
            return null
        }
    };
    e.prototype.Peek = function() {
        if (this.mArr.length > 0) {
            return this.mArr[0]
        } else {
            return null
        }
    };
    e.prototype.Count = function() {
        return this.mArr.length
    };
    return e
}();
var List = function() {
    function e() {
        this.mArr = new Array
    }
    Object.defineProperty(e.prototype, "Internal", {
        get: function() {
            return this.mArr
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.Add = function(e) {
        this.mArr.push(e)
    };
    Object.defineProperty(e.prototype, "Count", {
        get: function() {
            return this.mArr.length
        },
        enumerable: true,
        configurable: true
    });
    return e
}();
var Output = function() {
    function e() {}
    return e
}();
var Debug = function() {
    function e() {}
    e.Log = function(e) {
        if (e == null) {
            console.debug(e)
        }
        console.debug(e)
    };
    e.LogError = function(e) {
        console.debug(e)
    };
    e.LogWarning = function(e) {
        console.debug(e)
    };
    return e
}();
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
var Random = function() {
    function e() {}
    e.getRandomInt = function(e, t) {
        e = Math.ceil(e);
        t = Math.floor(t);
        return Math.floor(Math.random() * (t - e)) + e
    };
    return e
}();
var Helper = function() {
    function e() {}
    e.tryParseInt = function(e) {
        try {
            if (/^(\-|\+)?([0-9]+)$/.test(e)) {
                var t = Number(e);
                if (isNaN(t) == false) return t
            }
        } catch (e) {}
        return null
    };
    return e
}();
var SLog = function() {
    function e() {}
    e.L = function(e) {
        console.log(e)
    };
    e.Log = function(e) {
        console.log(e)
    };
    e.LogWarning = function(e) {
        console.debug(e)
    };
    e.LogError = function(e) {
        console.error(e)
    };
    return e
}();
var NetEventType;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["UnreliableMessageReceived"] = 1] = "UnreliableMessageReceived";
    e[e["ReliableMessageReceived"] = 2] = "ReliableMessageReceived";
    e[e["ServerInitialized"] = 3] = "ServerInitialized";
    e[e["ServerInitFailed"] = 4] = "ServerInitFailed";
    e[e["ServerClosed"] = 5] = "ServerClosed";
    e[e["NewConnection"] = 6] = "NewConnection";
    e[e["ConnectionFailed"] = 7] = "ConnectionFailed";
    e[e["Disconnected"] = 8] = "Disconnected";
    e[e["FatalError"] = 100] = "FatalError";
    e[e["Warning"] = 101] = "Warning";
    e[e["Log"] = 102] = "Log"
})(NetEventType || (NetEventType = {}));
var NetEventDataType;
(function(e) {
    e[e["Null"] = 0] = "Null";
    e[e["ByteArray"] = 1] = "ByteArray";
    e[e["UTF16String"] = 2] = "UTF16String"
})(NetEventDataType || (NetEventDataType = {}));
var NetworkEvent = function() {
    function e(e, t, n) {
        this.type = e;
        this.connectionId = t;
        this.data = n
    }
    Object.defineProperty(e.prototype, "RawData", {
        get: function() {
            return this.data
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "MessageData", {
        get: function() {
            if (typeof this.data != "string") return this.data;
            return null
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "Info", {
        get: function() {
            if (typeof this.data == "string") return this.data;
            return null
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "Type", {
        get: function() {
            return this.type
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(e.prototype, "ConnectionId", {
        get: function() {
            return this.connectionId
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.toString = function() {
        var e = "NetworkEvent[";
        e += "NetEventType: (";
        e += NetEventType[this.type];
        e += "), id: (";
        e += this.connectionId.id;
        e += "), Data: (";
        e += this.data;
        e += ")]";
        return e
    };
    e.parseFromString = function(t) {
        var n = JSON.parse(t);
        var i;
        if (n.data == null) {
            i = null
        } else if (typeof n.data == "string") {
            i = n.data
        } else if (typeof n.data == "object") {
            var r = n.data;
            var o = 0;
            for (var a in r) {
                o++
            }
            var s = new Uint8Array(Object.keys(r).length);
            for (var l = 0; l < s.length; l++) s[l] = r[l];
            i = s
        } else {
            console.error("data can't be parsed")
        }
        var u = new e(n.type, n.connectionId, i);
        return u
    };
    e.toString = function(e) {
        return JSON.stringify(e)
    };
    e.fromByteArray = function(t) {
        var n = t[0];
        var i = t[1];
        var r = new Int16Array(t.buffer, t.byteOffset + 2, 1)[0];
        var o = null;
        if (i == NetEventDataType.ByteArray) {
            var a = new Uint32Array(t.buffer, t.byteOffset + 4, 1)[0];
            var s = new Uint8Array(t.buffer, t.byteOffset + 8, a);
            o = s
        } else if (i == NetEventDataType.UTF16String) {
            var l = new Uint32Array(t.buffer, t.byteOffset + 4, 1)[0];
            var u = new Uint16Array(t.buffer, t.byteOffset + 8, l);
            var c = "";
            for (var f = 0; f < u.length; f++) {
                c += String.fromCharCode(u[f])
            }
            o = c
        }
        var d = new ConnectionId(r);
        var g = new e(n, d, o);
        return g
    };
    e.toByteArray = function(e) {
        var t;
        var n = 4;
        if (e.data == null) {
            t = NetEventDataType.Null
        } else if (typeof e.data == "string") {
            t = NetEventDataType.UTF16String;
            var i = e.data;
            n += i.length * 2 + 4
        } else {
            t = NetEventDataType.ByteArray;
            var r = e.data;
            n += 4 + r.length
        }
        var o = new Uint8Array(n);
        o[0] = e.type;
        o[1] = t;
        var a = new Int16Array(o.buffer, o.byteOffset + 2, 1);
        a[0] = e.connectionId.id;
        if (t == NetEventDataType.ByteArray) {
            var r = e.data;
            var s = new Uint32Array(o.buffer, o.byteOffset + 4, 1);
            s[0] = r.length;
            for (var l = 0; l < r.length; l++) {
                o[8 + l] = r[l]
            }
        } else if (t == NetEventDataType.UTF16String) {
            var i = e.data;
            var s = new Uint32Array(o.buffer, o.byteOffset + 4, 1);
            s[0] = i.length;
            var u = new Uint16Array(o.buffer, o.byteOffset + 8, i.length);
            for (var l = 0; l < u.length; l++) {
                u[l] = i.charCodeAt(l)
            }
        }
        return o
    };
    return e
}();
var ConnectionId = function() {
    function e(e) {
        this.id = e
    }
    e.INVALID = new e(-1);
    return e
}();
var LocalNetwork = function() {
    function e() {
        this.mNextNetworkId = new ConnectionId(1);
        this.mServerAddress = null;
        this.mEvents = new Queue;
        this.mConnectionNetwork = {};
        this.mIsDisposed = false;
        this.mId = e.sNextId;
        e.sNextId++
    }
    Object.defineProperty(e.prototype, "IsServer", {
        get: function() {
            return this.mServerAddress != null
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.StartServer = function(t) {
        if (t === void 0) {
            t = null
        }
        if (t == null) t = "" + this.mId;
        if (t in e.mServers) {
            this.Enqueue(NetEventType.ServerInitFailed, ConnectionId.INVALID, t);
            return
        }
        e.mServers[t] = this;
        this.mServerAddress = t;
        this.Enqueue(NetEventType.ServerInitialized, ConnectionId.INVALID, t)
    };
    e.prototype.StopServer = function() {
        if (this.IsServer) {
            this.Enqueue(NetEventType.ServerClosed, ConnectionId.INVALID, this.mServerAddress);
            delete e.mServers[this.mServerAddress];
            this.mServerAddress = null
        }
    };
    e.prototype.Connect = function(t) {
        var n = this.NextConnectionId();
        var i = false;
        if (t in e.mServers) {
            var r = e.mServers[t];
            if (r != null) {
                r.ConnectClient(this);
                this.mConnectionNetwork[n.id] = e.mServers[t];
                this.Enqueue(NetEventType.NewConnection, n, null);
                i = true
            }
        }
        if (i == false) {
            this.Enqueue(NetEventType.ConnectionFailed, n, "Couldn't connect to the given server with id " + t)
        }
        return n
    };
    e.prototype.Shutdown = function() {
        for (var e in this.mConnectionNetwork) {
            this.Disconnect(new ConnectionId(+e))
        }
        this.StopServer()
    };
    e.prototype.Dispose = function() {
        if (this.mIsDisposed == false) {
            this.Shutdown()
        }
    };
    e.prototype.SendData = function(e, t, n) {
        if (e.id in this.mConnectionNetwork) {
            var i = this.mConnectionNetwork[e.id];
            i.ReceiveData(this, t, n)
        }
    };
    e.prototype.Update = function() {
        this.CleanupWreakReferences()
    };
    e.prototype.Dequeue = function() {
        return this.mEvents.Dequeue()
    };
    e.prototype.Peek = function() {
        return this.mEvents.Peek()
    };
    e.prototype.Flush = function() {};
    e.prototype.Disconnect = function(e) {
        if (e.id in this.mConnectionNetwork) {
            var t = this.mConnectionNetwork[e.id];
            if (t != null) {
                t.InternalDisconnectNetwork(this);
                this.InternalDisconnect(e)
            } else {
                this.CleanupWreakReferences()
            }
        }
    };
    e.prototype.FindConnectionId = function(e) {
        for (var t in this.mConnectionNetwork) {
            var n = this.mConnectionNetwork[t];
            if (n != null) {
                return new ConnectionId(+t)
            }
        }
        return ConnectionId.INVALID
    };
    e.prototype.NextConnectionId = function() {
        var e = this.mNextNetworkId;
        this.mNextNetworkId = new ConnectionId(e.id + 1);
        return e
    };
    e.prototype.ConnectClient = function(e) {
        var t = this.NextConnectionId();
        this.mConnectionNetwork[t.id] = e;
        this.Enqueue(NetEventType.NewConnection, t, null)
    };
    e.prototype.Enqueue = function(e, t, n) {
        var i = new NetworkEvent(e, t, n);
        this.mEvents.Enqueue(i)
    };
    e.prototype.ReceiveData = function(e, t, n) {
        var i = this.FindConnectionId(e);
        var r = new Uint8Array(t.length);
        for (var o = 0; o < r.length; o++) {
            r[o] = t[o]
        }
        var a = NetEventType.UnreliableMessageReceived;
        if (n) a = NetEventType.ReliableMessageReceived;
        this.Enqueue(a, i, r)
    };
    e.prototype.InternalDisconnect = function(e) {
        if (e.id in this.mConnectionNetwork) {
            this.Enqueue(NetEventType.Disconnected, e, null);
            delete this.mConnectionNetwork[e.id]
        }
    };
    e.prototype.InternalDisconnectNetwork = function(e) {
        this.InternalDisconnect(this.FindConnectionId(e))
    };
    e.prototype.CleanupWreakReferences = function() {};
    e.sNextId = 1;
    e.mServers = {};
    return e
}();

function WebRtcNetwork_test1() {
    console.log("test1");
    var e = "test1234";
    var t;
    if (window.location.protocol != "https:") {
        t = "ws://localhost:12776"
    } else {
        t = "wss://localhost:12777"
    }
    var n = {
        iceServers: [{
            urls: ["stun:stun.l.google.com:19302"]
        }]
    };
    var i = new WebRtcNetwork(new SignalingConfig(new LocalNetwork), n);
    i.StartServer();
    var r = new WebRtcNetwork(new SignalingConfig(new LocalNetwork), n);
    setInterval(function() {
        i.Update();
        var t = null;
        while (t = i.Dequeue()) {
            console.log("server inc: " + t.toString());
            if (t.Type == NetEventType.ServerInitialized) {
                console.log("server started. Address " + t.Info);
                r.Connect(t.Info)
            } else if (t.Type == NetEventType.ServerInitFailed) {
                console.error("server start failed")
            } else if (t.Type == NetEventType.NewConnection) {
                console.log("server new incoming connection")
            } else if (t.Type == NetEventType.Disconnected) {
                console.log("server peer disconnected");
                console.log("server shutdown");
                i.Shutdown()
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                i.SendData(t.ConnectionId, t.MessageData, true)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                i.SendData(t.ConnectionId, t.MessageData, false)
            }
        }
        i.Flush();
        r.Update();
        while (t = r.Dequeue()) {
            console.log("client inc: " + t.toString());
            if (t.Type == NetEventType.NewConnection) {
                console.log("client connection established");
                var n = stringToBuffer(e);
                r.SendData(t.ConnectionId, n, true)
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                var o = bufferToString(t.MessageData);
                if (o != e) {
                    console.error("Test failed sent string %s but received string %s", e, o)
                }
                var n = stringToBuffer(e);
                r.SendData(t.ConnectionId, n, false)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                var o = bufferToString(t.MessageData);
                if (o != e) {
                    console.error("Test failed sent string %s but received string %s", e, o)
                }
                console.log("client disconnecting");
                r.Disconnect(t.ConnectionId);
                console.log("client shutting down");
                r.Shutdown()
            }
        }
        r.Flush()
    }, 100)
}

function WebsocketNetwork_sharedaddress() {
    console.log("WebsocketNetwork shared address test");
    var e = "test1234";
    var t = true;
    var n = true;
    var i;
    var r;
    if (window.location.protocol != "https:" && n) {
        i = "wss://because-why-not.com:12776/testshare";
        if (t) i = "ws://localhost:12776/testshare"
    } else {
        i = "wss://because-why-not.com:12777/testshare";
        if (t) i = "wss://localhost:12777/testshare"
    }
    var o = "sharedaddresstest";
    var a = new WebsocketNetwork(i);
    var s = new WebsocketNetwork(i);
    var l = new WebsocketNetwork(i);
    var u = stringToBuffer("network1 says hi");
    var c = stringToBuffer("network2 says hi");
    var f = stringToBuffer("network3 says hi");
    a.StartServer(o);
    s.StartServer(o);
    l.StartServer(o);

    function d(e, t) {
        e.Update();
        var n = null;
        while (n = e.Dequeue()) {
            if (n.Type == NetEventType.ServerInitFailed || n.Type == NetEventType.ConnectionFailed || n.Type == NetEventType.ServerClosed) {
                console.error(t + "inc: " + n.toString())
            } else {
                console.log(t + "inc: " + n.toString())
            }
            if (n.Type == NetEventType.ServerInitialized) {} else if (n.Type == NetEventType.ServerInitFailed) {} else if (n.Type == NetEventType.NewConnection) {
                var i = stringToBuffer(t + "says hi!");
                e.SendData(n.ConnectionId, i, true)
            } else if (n.Type == NetEventType.Disconnected) {} else if (n.Type == NetEventType.ReliableMessageReceived) {
                var r = bufferToString(n.MessageData);
                console.log(t + " received: " + r)
            } else if (n.Type == NetEventType.UnreliableMessageReceived) {}
        }
        e.Flush()
    }
    var g = 0;
    setInterval(function() {
        d(a, "network1 ");
        d(s, "network2 ");
        d(l, "network3 ");
        g += 100;
        if (g == 1e4) {
            console.log("network1 shutdown");
            a.Shutdown()
        }
        if (g == 15e3) {
            console.log("network2 shutdown");
            s.Shutdown()
        }
        if (g == 2e4) {
            console.log("network3 shutdown");
            l.Shutdown()
        }
    }, 100)
}

function CAPIWebRtcNetwork_test1() {
    console.log("test1");
    var e = "test1234";
    var t = '{ "signaling" :  { "class": "LocalNetwork", "param" : null}, "iceServers":["stun:stun.l.google.com:19302"]}';
    var n = CAPIWebRtcNetworkCreate(t);
    CAPIWebRtcNetworkStartServer(n, "Room1");
    var i = CAPIWebRtcNetworkCreate(t);
    setInterval(function() {
        CAPIWebRtcNetworkUpdate(n);
        var t = null;
        while (t = CAPIWebRtcNetworkDequeue(n)) {
            console.log("server inc: " + t.toString());
            if (t.Type == NetEventType.ServerInitialized) {
                console.log("server started. Address " + t.Info);
                CAPIWebRtcNetworkConnect(i, t.Info)
            } else if (t.Type == NetEventType.ServerInitFailed) {
                console.error("server start failed")
            } else if (t.Type == NetEventType.NewConnection) {
                console.log("server new incoming connection")
            } else if (t.Type == NetEventType.Disconnected) {
                console.log("server peer disconnected");
                console.log("server shutdown");
                CAPIWebRtcNetworkShutdown(n)
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                CAPIWebRtcNetworkSendData(n, t.ConnectionId.id, t.MessageData, true)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                CAPIWebRtcNetworkSendData(n, t.ConnectionId.id, t.MessageData, false)
            }
        }
        CAPIWebRtcNetworkFlush(n);
        CAPIWebRtcNetworkUpdate(i);
        while (t = CAPIWebRtcNetworkDequeue(i)) {
            console.log("client inc: " + t.toString());
            if (t.Type == NetEventType.NewConnection) {
                console.log("client connection established");
                var r = stringToBuffer(e);
                CAPIWebRtcNetworkSendData(i, t.ConnectionId.id, r, true)
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                var o = bufferToString(t.MessageData);
                if (o != e) {
                    console.error("Test failed sent string %s but received string %s", e, o)
                }
                var r = stringToBuffer(e);
                CAPIWebRtcNetworkSendData(i, t.ConnectionId.id, r, false)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                var o = bufferToString(t.MessageData);
                if (o != e) {
                    console.error("Test failed sent string %s but received string %s", e, o)
                }
                console.log("client disconnecting");
                CAPIWebRtcNetworkDisconnect(i, t.ConnectionId.id);
                console.log("client shutting down");
                CAPIWebRtcNetworkShutdown(i)
            }
        }
        CAPIWebRtcNetworkFlush(i)
    }, 100)
}
var WebRtcNetworkServerState;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["Offline"] = 1] = "Offline";
    e[e["Starting"] = 2] = "Starting";
    e[e["Online"] = 3] = "Online"
})(WebRtcNetworkServerState || (WebRtcNetworkServerState = {}));
var SignalingConfig = function() {
    function e(e) {
        this.mNetwork = e
    }
    e.prototype.GetNetwork = function() {
        return this.mNetwork
    };
    return e
}();
var SignalingInfo = function() {
    function e(e, t, n) {
        this.mConnectionId = e;
        this.mIsIncoming = t;
        this.mCreationTime = n;
        this.mSignalingConnected = true
    }
    e.prototype.IsSignalingConnected = function() {
        return this.mSignalingConnected
    };
    Object.defineProperty(e.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.IsIncoming = function() {
        return this.mIsIncoming
    };
    e.prototype.GetCreationTimeMs = function() {
        return Date.now() - this.mCreationTime
    };
    e.prototype.SignalingDisconnected = function() {
        this.mSignalingConnected = false
    };
    return e
}();
var WebRtcNetwork = function() {
    function e(e, t) {
        this.mTimeout = 6e4;
        this.mInSignaling = {};
        this.mNextId = new ConnectionId(1);
        this.mSignaling = null;
        this.mEvents = new Queue;
        this.mIdToConnection = {};
        this.mConnectionIds = new Array;
        this.mServerState = WebRtcNetworkServerState.Offline;
        this.mIsDisposed = false;
        this.mSignaling = e;
        this.mSignalingNetwork = this.mSignaling.GetNetwork();
        this.mRtcConfig = t
    }
    Object.defineProperty(e.prototype, "IdToConnection", {
        get: function() {
            return this.mIdToConnection
        },
        enumerable: true,
        configurable: true
    });
    e.prototype.GetConnections = function() {
        return this.mConnectionIds
    };
    e.prototype.SetLog = function(e) {
        this.mLogDelegate = e
    };
    e.prototype.StartServer = function(e) {
        this.mServerState = WebRtcNetworkServerState.Starting;
        this.mSignalingNetwork.StartServer(e)
    };
    e.prototype.StopServer = function() {
        if (this.mServerState == WebRtcNetworkServerState.Starting) {
            this.mSignalingNetwork.StopServer()
        } else if (this.mServerState == WebRtcNetworkServerState.Online) {
            this.mSignalingNetwork.StopServer()
        }
    };
    e.prototype.Connect = function(e) {
        console.log("Connecting ...");
        return this.AddOutgoingConnection(e)
    };
    e.prototype.Update = function() {
        this.CheckSignalingState();
        this.UpdateSignalingNetwork();
        this.UpdatePeers()
    };
    e.prototype.Dequeue = function() {
        if (this.mEvents.Count() > 0) return this.mEvents.Dequeue();
        return null
    };
    e.prototype.Peek = function() {
        if (this.mEvents.Count() > 0) return this.mEvents.Peek();
        return null
    };
    e.prototype.Flush = function() {
        this.mSignalingNetwork.Flush()
    };
    e.prototype.SendData = function(e, t, n) {
        if (e == null || t == null || t.length == 0) return;
        var i = this.mIdToConnection[e.id];
        if (i) {
            i.SendData(t, n)
        } else {
            Debug.LogWarning("unknown connection id")
        }
    };
    e.prototype.Disconnect = function(e) {
        var t = this.mIdToConnection[e.id];
        if (t) {
            this.HandleDisconnect(e)
        }
    };
    e.prototype.Shutdown = function() {
        for (var e = 0, t = this.mConnectionIds; e < t.length; e++) {
            var n = t[e];
            this.Disconnect(n)
        }
        this.StopServer();
        this.mSignalingNetwork.Shutdown()
    };
    e.prototype.DisposeInternal = function() {
        if (this.mIsDisposed == false) {
            this.Shutdown();
            this.mIsDisposed = true
        }
    };
    e.prototype.Dispose = function() {
        this.DisposeInternal()
    };
    e.prototype.CreatePeer = function(e, t) {
        var n = new WebRtcDataPeer(e, t);
        return n
    };
    e.prototype.CheckSignalingState = function() {
        var e = new Array;
        var t = new Array;
        for (var n in this.mInSignaling) {
            var i = this.mInSignaling[n];
            i.Update();
            var r = i.SignalingInfo.GetCreationTimeMs();
            var o = new Output;
            while (i.DequeueSignalingMessage(o)) {
                var a = this.StringToBuffer(o.val);
                this.mSignalingNetwork.SendData(new ConnectionId(+n), a, true)
            }
            if (i.GetState() == WebRtcPeerState.Connected) {
                e.push(i.SignalingInfo.ConnectionId)
            } else if (i.GetState() == WebRtcPeerState.SignalingFailed || r > this.mTimeout) {
                t.push(i.SignalingInfo.ConnectionId)
            }
        }
        for (var s = 0, l = e; s < l.length; s++) {
            var u = l[s];
            this.ConnectionEstablished(u)
        }
        for (var c = 0, f = t; c < f.length; c++) {
            var u = f[c];
            this.SignalingFailed(u)
        }
    };
    e.prototype.UpdateSignalingNetwork = function() {
        this.mSignalingNetwork.Update();
        var e;
        while ((e = this.mSignalingNetwork.Dequeue()) != null) {
            if (e.Type == NetEventType.ServerInitialized) {
                this.mServerState = WebRtcNetworkServerState.Online;
                this.mEvents.Enqueue(new NetworkEvent(NetEventType.ServerInitialized, ConnectionId.INVALID, e.RawData))
            } else if (e.Type == NetEventType.ServerInitFailed) {
                this.mServerState = WebRtcNetworkServerState.Offline;
                this.mEvents.Enqueue(new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, e.RawData))
            } else if (e.Type == NetEventType.ServerClosed) {
                this.mServerState = WebRtcNetworkServerState.Offline;
                this.mEvents.Enqueue(new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, e.RawData))
            } else if (e.Type == NetEventType.NewConnection) {
                var t = this.mInSignaling[e.ConnectionId.id];
                if (t) {
                    t.StartSignaling()
                } else {
                    this.AddIncomingConnection(e.ConnectionId)
                }
            } else if (e.Type == NetEventType.ConnectionFailed) {
                this.SignalingFailed(e.ConnectionId)
            } else if (e.Type == NetEventType.Disconnected) {
                var t = this.mInSignaling[e.ConnectionId.id];
                if (t) {
                    t.SignalingInfo.SignalingDisconnected()
                }
            } else if (e.Type == NetEventType.ReliableMessageReceived) {
                var t = this.mInSignaling[e.ConnectionId.id];
                if (t) {
                    var n = this.BufferToString(e.MessageData);
                    t.AddSignalingMessage(n)
                } else {
                    Debug.LogWarning("Signaling message from unknown connection received")
                }
            }
        }
    };
    e.prototype.UpdatePeers = function() {
        var e = new Array;
        for (var t in this.mIdToConnection) {
            var n = this.mIdToConnection[t];
            n.Update();
            var i = new Output;
            while (n.DequeueEvent(i)) {
                this.mEvents.Enqueue(i.val)
            }
            if (n.GetState() == WebRtcPeerState.Closed) {
                e.push(n.ConnectionId)
            }
        }
        for (var r = 0, o = e; r < o.length; r++) {
            var a = o[r];
            this.HandleDisconnect(a)
        }
    };
    e.prototype.AddOutgoingConnection = function(e) {
        Debug.Log("new outgoing connection");
        var t = this.mSignalingNetwork.Connect(e);
        var n = new SignalingInfo(t, false, Date.now());
        var i = this.CreatePeer(this.NextConnectionId(), this.mRtcConfig);
        i.SetSignalingInfo(n);
        this.mInSignaling[t.id] = i;
        return i.ConnectionId
    };
    e.prototype.AddIncomingConnection = function(e) {
        Debug.Log("new incoming connection");
        var t = new SignalingInfo(e, true, Date.now());
        var n = this.CreatePeer(this.NextConnectionId(), this.mRtcConfig);
        n.SetSignalingInfo(t);
        this.mInSignaling[e.id] = n;
        n.NegotiateSignaling();
        return n.ConnectionId
    };
    e.prototype.ConnectionEstablished = function(e) {
        var t = this.mInSignaling[e.id];
        delete this.mInSignaling[e.id];
        this.mSignalingNetwork.Disconnect(e);
        this.mConnectionIds.push(t.ConnectionId);
        this.mIdToConnection[t.ConnectionId.id] = t;
        this.mEvents.Enqueue(new NetworkEvent(NetEventType.NewConnection, t.ConnectionId, null))
    };
    e.prototype.SignalingFailed = function(e) {
        var t = this.mInSignaling[e.id];
        if (t) {
            delete this.mInSignaling[e.id];
            this.mEvents.Enqueue(new NetworkEvent(NetEventType.ConnectionFailed, t.ConnectionId, null));
            if (t.SignalingInfo.IsSignalingConnected()) {
                this.mSignalingNetwork.Disconnect(e)
            }
            t.Dispose()
        }
    };
    e.prototype.HandleDisconnect = function(e) {
        var t = this.mIdToConnection[e.id];
        if (t) {
            t.Dispose()
        }
        var n = this.mConnectionIds.indexOf(e);
        if (n != -1) {
            this.mConnectionIds.splice(n, 1)
        }
        delete this.mIdToConnection[e.id];
        var i = new NetworkEvent(NetEventType.Disconnected, e, null);
        this.mEvents.Enqueue(i)
    };
    e.prototype.NextConnectionId = function() {
        var e = new ConnectionId(this.mNextId.id);
        this.mNextId.id++;
        return e
    };
    e.prototype.StringToBuffer = function(e) {
        var t = new ArrayBuffer(e.length * 2);
        var n = new Uint16Array(t);
        for (var i = 0, r = e.length; i < r; i++) {
            n[i] = e.charCodeAt(i)
        }
        var o = new Uint8Array(t);
        return o
    };
    e.prototype.BufferToString = function(e) {
        var t = new Uint16Array(e.buffer, e.byteOffset, e.byteLength / 2);
        return String.fromCharCode.apply(null, t)
    };
    return e
}();
var WebRtcPeerState;
(function(e) {
    e[e["Invalid"] = 0] = "Invalid";
    e[e["Created"] = 1] = "Created";
    e[e["Signaling"] = 2] = "Signaling";
    e[e["SignalingFailed"] = 3] = "SignalingFailed";
    e[e["Connected"] = 4] = "Connected";
    e[e["Closing"] = 5] = "Closing";
    e[e["Closed"] = 6] = "Closed"
})(WebRtcPeerState || (WebRtcPeerState = {}));
var WebRtcInternalState;
(function(e) {
    e[e["None"] = 0] = "None";
    e[e["Signaling"] = 1] = "Signaling";
    e[e["SignalingFailed"] = 2] = "SignalingFailed";
    e[e["Connected"] = 3] = "Connected";
    e[e["Closed"] = 4] = "Closed"
})(WebRtcInternalState || (WebRtcInternalState = {}));
var AWebRtcPeer = function() {
    function e(e) {
        this.mState = WebRtcPeerState.Invalid;
        this.mRtcInternalState = WebRtcInternalState.None;
        this.mIncomingSignalingQueue = new Queue;
        this.mOutgoingSignalingQueue = new Queue;
        this.mDidSendRandomNumber = false;
        this.mRandomNumerSent = 0;
        this.mOfferOptions = {
            offerToReceiveAudio: 0,
            offerToReceiveVideo: 0
        };
        this.gConnectionConfig = {
            optional: [{
                DtlsSrtpKeyAgreement: true
            }]
        };
        this.SetupPeer(e);
        this.OnSetup();
        this.mState = WebRtcPeerState.Created
    }
    e.prototype.GetState = function() {
        return this.mState
    };
    e.prototype.SetupPeer = function(e) {
        var t = this;
        var n = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
        this.mPeer = new n(e, this.gConnectionConfig);
        this.mPeer.onicecandidate = function(e) {
            t.OnIceCandidate(e)
        };
        this.mPeer.oniceconnectionstatechange = function(e) {
            t.OnIceConnectionChange()
        };
        this.mPeer.onnegotiationneeded = function(e) {
            t.OnRenegotiationNeeded()
        };
        this.mPeer.onsignalingstatechange = function(e) {
            t.OnSignalingChange()
        }
    };
    e.prototype.DisposeInternal = function() {
        this.Cleanup()
    };
    e.prototype.Dispose = function() {
        if (this.mPeer != null) {
            this.DisposeInternal()
        }
    };
    e.prototype.Cleanup = function() {
        if (this.mState == WebRtcPeerState.Closed || this.mState == WebRtcPeerState.Closing) {
            return
        }
        this.mState = WebRtcPeerState.Closing;
        this.OnCleanup();
        if (this.mPeer != null) this.mPeer.close();
        this.mState = WebRtcPeerState.Closed
    };
    e.prototype.Update = function() {
        if (this.mState != WebRtcPeerState.Closed && this.mState != WebRtcPeerState.Closing && this.mState != WebRtcPeerState.SignalingFailed) this.UpdateState();
        if (this.mState == WebRtcPeerState.Signaling || this.mState == WebRtcPeerState.Created) this.HandleIncomingSignaling()
    };
    e.prototype.UpdateState = function() {
        if (this.mRtcInternalState == WebRtcInternalState.Closed) {
            this.Cleanup()
        } else if (this.mRtcInternalState == WebRtcInternalState.SignalingFailed) {
            this.mState = WebRtcPeerState.SignalingFailed
        } else if (this.mRtcInternalState == WebRtcInternalState.Connected) {
            this.mState = WebRtcPeerState.Connected
        }
    };
    e.prototype.HandleIncomingSignaling = function() {
        while (this.mIncomingSignalingQueue.Count() > 0) {
            var e = this.mIncomingSignalingQueue.Dequeue();
            var t = Helper.tryParseInt(e);
            if (t != null) {
                if (this.mDidSendRandomNumber) {
                    if (t < this.mRandomNumerSent) {
                        SLog.L("Signaling negotiation complete. Starting signaling.");
                        this.StartSignaling()
                    } else if (t == this.mRandomNumerSent) {
                        this.NegotiateSignaling()
                    } else {
                        SLog.L("Signaling negotiation complete. Waiting for signaling.")
                    }
                } else {}
            } else {
                var n = JSON.parse(e);
                if (n.sdp) {
                    var i = new RTCSessionDescription(n);
                    if (i.type == "offer") {
                        this.CreateAnswer(i)
                    } else {
                        this.RecAnswer(i)
                    }
                } else {
                    var r = new RTCIceCandidate(n);
                    if (r != null) {
                        this.mPeer.addIceCandidate(r, function() {}, function(e) {
                            Debug.LogError(e)
                        })
                    }
                }
            }
        }
    };
    e.prototype.AddSignalingMessage = function(e) {
        Debug.Log("incoming Signaling message " + e);
        this.mIncomingSignalingQueue.Enqueue(e)
    };
    e.prototype.DequeueSignalingMessage = function(e) {
        {
            if (this.mOutgoingSignalingQueue.Count() > 0) {
                e.val = this.mOutgoingSignalingQueue.Dequeue();
                return true
            } else {
                e.val = null;
                return false
            }
        }
    };
    e.prototype.EnqueueOutgoing = function(e) {
        {
            Debug.Log("Outgoing Signaling message " + e);
            this.mOutgoingSignalingQueue.Enqueue(e)
        }
    };
    e.prototype.StartSignaling = function() {
        this.OnStartSignaling();
        this.CreateOffer()
    };
    e.prototype.NegotiateSignaling = function() {
        var e = Random.getRandomInt(0, 2147483647);
        this.mRandomNumerSent = e;
        this.mDidSendRandomNumber = true;
        this.EnqueueOutgoing("" + e)
    };
    e.prototype.CreateOffer = function() {
        var e = this;
        Debug.Log("CreateOffer");
        this.mPeer.createOffer(function(t) {
            var n = JSON.stringify(t);
            e.mPeer.setLocalDescription(t, function() {
                e.RtcSetSignalingStarted();
                e.EnqueueOutgoing(n)
            }, function(t) {
                Debug.LogError(t);
                e.RtcSetSignalingFailed()
            })
        }, function(t) {
            Debug.LogError(t);
            e.RtcSetSignalingFailed()
        }, this.mOfferOptions)
    };
    e.prototype.CreateAnswer = function(e) {
        var t = this;
        Debug.Log("CreateAnswer");
        this.mPeer.setRemoteDescription(e, function() {
            t.mPeer.createAnswer(function(e) {
                var n = JSON.stringify(e);
                t.mPeer.setLocalDescription(e, function() {
                    t.RtcSetSignalingStarted();
                    t.EnqueueOutgoing(n)
                }, function(e) {
                    Debug.LogError(e);
                    t.RtcSetSignalingFailed()
                })
            }, function(e) {
                Debug.LogError(e);
                t.RtcSetSignalingFailed()
            })
        }, function(e) {
            Debug.LogError(e);
            t.RtcSetSignalingFailed()
        })
    };
    e.prototype.RecAnswer = function(e) {
        var t = this;
        Debug.Log("RecAnswer");
        this.mPeer.setRemoteDescription(e, function() {}, function(e) {
            Debug.LogError(e);
            t.RtcSetSignalingFailed()
        })
    };
    e.prototype.RtcSetSignalingStarted = function() {
        if (this.mRtcInternalState == WebRtcInternalState.None) {
            this.mRtcInternalState = WebRtcInternalState.Signaling
        }
    };
    e.prototype.RtcSetSignalingFailed = function() {
        this.mRtcInternalState = WebRtcInternalState.SignalingFailed
    };
    e.prototype.RtcSetConnected = function() {
        if (this.mRtcInternalState == WebRtcInternalState.Signaling) this.mRtcInternalState = WebRtcInternalState.Connected
    };
    e.prototype.RtcSetClosed = function() {
        if (this.mRtcInternalState == WebRtcInternalState.Connected) this.mRtcInternalState = WebRtcInternalState.Closed
    };
    e.prototype.OnIceCandidate = function(e) {
        if (e && e.candidate) {
            var t = e.candidate;
            var n = JSON.stringify(t);
            this.EnqueueOutgoing(n)
        }
    };
    e.prototype.OnIceConnectionChange = function() {
        Debug.Log(this.mPeer.iceConnectionState);
        if (this.mPeer.iceConnectionState == "failed") {
            this.mState = WebRtcPeerState.SignalingFailed
        }
    };
    e.prototype.OnIceGatheringChange = function() {
        Debug.Log(this.mPeer.iceGatheringState)
    };
    e.prototype.OnRenegotiationNeeded = function() {};
    e.prototype.OnSignalingChange = function() {
        Debug.Log(this.mPeer.signalingState);
        if (this.mPeer.signalingState == "closed") {
            this.RtcSetClosed()
        }
    };
    return e
}();
var WebRtcDataPeer = function(e) {
    __extends(t, e);

    function t(t, n) {
        e.call(this, n);
        this.mInfo = null;
        this.mEvents = new Queue;
        this.mReliableDataChannelReady = false;
        this.mUnreliableDataChannelReady = false;
        this.mConnectionId = t
    }
    Object.defineProperty(t.prototype, "ConnectionId", {
        get: function() {
            return this.mConnectionId
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(t.prototype, "SignalingInfo", {
        get: function() {
            return this.mInfo
        },
        enumerable: true,
        configurable: true
    });
    t.prototype.SetSignalingInfo = function(e) {
        this.mInfo = e
    };
    t.prototype.OnSetup = function() {
        var e = this;
        this.mPeer.ondatachannel = function(t) {
            e.OnDataChannel(t.channel)
        }
    };
    t.prototype.OnStartSignaling = function() {
        var e = {};
        this.mReliableDataChannel = this.mPeer.createDataChannel(t.sLabelReliable, e);
        this.RegisterObserverReliable();
        var n = {};
        n.maxRetransmits = 0;
        n.ordered = false;
        this.mUnreliableDataChannel = this.mPeer.createDataChannel(t.sLabelUnreliable, n);
        this.RegisterObserverUnreliable()
    };
    t.prototype.OnCleanup = function() {
        if (this.mReliableDataChannel != null) this.mReliableDataChannel.close();
        if (this.mUnreliableDataChannel != null) this.mUnreliableDataChannel.close()
    };
    t.prototype.RegisterObserverReliable = function() {
        var e = this;
        this.mReliableDataChannel.onmessage = function(t) {
            e.ReliableDataChannel_OnMessage(t)
        };
        this.mReliableDataChannel.onopen = function(t) {
            e.ReliableDataChannel_OnOpen()
        };
        this.mReliableDataChannel.onclose = function(t) {
            e.ReliableDataChannel_OnClose()
        };
        this.mReliableDataChannel.onerror = function(t) {
            e.ReliableDataChannel_OnError("")
        }
    };
    t.prototype.RegisterObserverUnreliable = function() {
        var e = this;
        this.mUnreliableDataChannel.onmessage = function(t) {
            e.UnreliableDataChannel_OnMessage(t)
        };
        this.mUnreliableDataChannel.onopen = function(t) {
            e.UnreliableDataChannel_OnOpen()
        };
        this.mUnreliableDataChannel.onclose = function(t) {
            e.UnreliableDataChannel_OnClose()
        };
        this.mUnreliableDataChannel.onerror = function(t) {
            e.UnreliableDataChannel_OnError("")
        }
    };
    t.prototype.SendData = function(e, t) {
        var n = e;
        if (t) {
            this.mReliableDataChannel.send(n)
        } else {
            this.mUnreliableDataChannel.send(n)
        }
    };
    t.prototype.DequeueEvent = function(e) {
        {
            if (this.mEvents.Count() > 0) {
                e.val = this.mEvents.Dequeue();
                return true
            }
        }
        return false
    };
    t.prototype.Enqueue = function(e) {
        {
            this.mEvents.Enqueue(e)
        }
    };
    t.prototype.OnDataChannel = function(e) {
        var n = e;
        if (n.label == t.sLabelReliable) {
            this.mReliableDataChannel = n;
            this.RegisterObserverReliable()
        } else if (n.label == t.sLabelUnreliable) {
            this.mUnreliableDataChannel = n;
            this.RegisterObserverUnreliable()
        } else {
            Debug.LogError("Datachannel with unexpected label " + n.label)
        }
    };
    t.prototype.RtcOnMessageReceived = function(e, t) {
        var n = NetEventType.UnreliableMessageReceived;
        if (t) {
            n = NetEventType.ReliableMessageReceived
        }
        if (e.data instanceof ArrayBuffer) {
            var i = new Uint8Array(e.data);
            this.Enqueue(new NetworkEvent(n, this.mConnectionId, i))
        } else if (e.data instanceof Blob) {
            var r = this.mConnectionId;
            var o = new FileReader;
            var a = this;
            o.onload = function() {
                var e = new Uint8Array(this.result);
                a.Enqueue(new NetworkEvent(n, a.mConnectionId, e))
            };
            o.readAsArrayBuffer(e.data)
        } else {
            Debug.LogError("Invalid message type. Only blob and arraybuffer supported: " + e.data)
        }
    };
    t.prototype.ReliableDataChannel_OnMessage = function(e) {
        Debug.Log("ReliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(e, true)
    };
    t.prototype.ReliableDataChannel_OnOpen = function() {
        Debug.Log("mReliableDataChannelReady");
        this.mReliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            Debug.Log("Fully connected")
        }
    };
    t.prototype.ReliableDataChannel_OnClose = function() {
        this.RtcSetClosed()
    };
    t.prototype.ReliableDataChannel_OnError = function(e) {
        Debug.LogError(e);
        this.RtcSetClosed()
    };
    t.prototype.UnreliableDataChannel_OnMessage = function(e) {
        Debug.Log("UnreliableDataChannel_OnMessage ");
        this.RtcOnMessageReceived(e, false)
    };
    t.prototype.UnreliableDataChannel_OnOpen = function() {
        Debug.Log("mUnreliableDataChannelReady");
        this.mUnreliableDataChannelReady = true;
        if (this.IsRtcConnected()) {
            this.RtcSetConnected();
            Debug.Log("Fully connected")
        }
    };
    t.prototype.UnreliableDataChannel_OnClose = function() {
        this.RtcSetClosed()
    };
    t.prototype.UnreliableDataChannel_OnError = function(e) {
        Debug.LogError(e);
        this.RtcSetClosed()
    };
    t.prototype.IsRtcConnected = function() {
        return this.mReliableDataChannelReady && this.mUnreliableDataChannelReady
    };
    t.sLabelReliable = "reliable";
    t.sLabelUnreliable = "unreliable";
    return t
}(AWebRtcPeer);
var WebsocketConnectionStatus;
(function(e) {
    e[e["Uninitialized"] = 0] = "Uninitialized";
    e[e["NotConnected"] = 1] = "NotConnected";
    e[e["Connecting"] = 2] = "Connecting";
    e[e["Connected"] = 3] = "Connected";
    e[e["Disconnecting"] = 4] = "Disconnecting"
})(WebsocketConnectionStatus || (WebsocketConnectionStatus = {}));
var WebsocketServerStatus;
(function(e) {
    e[e["Offline"] = 0] = "Offline";
    e[e["Starting"] = 1] = "Starting";
    e[e["Online"] = 2] = "Online";
    e[e["ShuttingDown"] = 3] = "ShuttingDown"
})(WebsocketServerStatus || (WebsocketServerStatus = {}));
var WebsocketNetwork = function() {
    function e(e) {
        this.mStatus = WebsocketConnectionStatus.Uninitialized;
        this.mOutgoingQueue = new Array;
        this.mIncomingQueue = new Array;
        this.mServerStatus = WebsocketServerStatus.Offline;
        this.mConnecting = new Array;
        this.mConnections = new Array;
        this.mNextOutgoingConnectionId = new ConnectionId(1);
        this.mUrl = null;
        this.mIsDisposed = false;
        this.mUrl = e;
        this.mStatus = WebsocketConnectionStatus.NotConnected
    }
    e.prototype.getStatus = function() {
        return this.mStatus
    };
    e.prototype.WebsocketConnect = function() {
        var e = this;
        this.mStatus = WebsocketConnectionStatus.Connecting;
        this.mSocket = new WebSocket(this.mUrl);
        this.mSocket.binaryType = "arraybuffer";
        this.mSocket.onopen = function() {
            e.OnWebsocketOnOpen()
        };
        this.mSocket.onerror = function(t) {
            e.OnWebsocketOnError(t)
        };
        this.mSocket.onmessage = function(t) {
            e.OnWebsocketOnMessage(t)
        };
        this.mSocket.onclose = function(t) {
            e.OnWebsocketOnClose(t)
        }
    };
    e.prototype.WebsocketCleanup = function() {
        this.mSocket.onopen = null;
        this.mSocket.onerror = null;
        this.mSocket.onmessage = null;
        this.mSocket.onclose = null;
        if (this.mSocket.readyState == this.mSocket.OPEN || this.mSocket.readyState == this.mSocket.CONNECTING) {
            this.mSocket.close()
        }
        this.mSocket = null
    };
    e.prototype.EnsureServerConnection = function() {
        if (this.mStatus == WebsocketConnectionStatus.NotConnected) {
            this.WebsocketConnect()
        }
    };
    e.prototype.CheckSleep = function() {
        if (this.mStatus == WebsocketConnectionStatus.Connected && this.mServerStatus == WebsocketServerStatus.Offline && this.mConnecting.length == 0 && this.mConnections.length == 0) {
            this.Cleanup()
        }
    };
    e.prototype.OnWebsocketOnOpen = function() {
        console.log("onWebsocketOnOpen");
        this.mStatus = WebsocketConnectionStatus.Connected
    };
    e.prototype.OnWebsocketOnClose = function(e) {
        console.log("Closed: " + JSON.stringify(e));
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting || this.mStatus == WebsocketConnectionStatus.NotConnected) return;
        this.Cleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected
    };
    e.prototype.OnWebsocketOnMessage = function(e) {
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting || this.mStatus == WebsocketConnectionStatus.NotConnected) return;
        var t = NetworkEvent.fromByteArray(new Uint8Array(e.data));
        this.HandleIncomingEvent(t)
    };
    e.prototype.OnWebsocketOnError = function(e) {
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting || this.mStatus == WebsocketConnectionStatus.NotConnected) return;
        console.log("WebSocket Error " + e)
    };
    e.prototype.Cleanup = function() {
        if (this.mStatus == WebsocketConnectionStatus.Disconnecting || this.mStatus == WebsocketConnectionStatus.NotConnected) return;
        this.mStatus = WebsocketConnectionStatus.Disconnecting;
        for (var e = 0, t = this.mConnecting; e < t.length; e++) {
            var n = t[e];
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ConnectionFailed, new ConnectionId(n), null))
        }
        this.mConnecting = new Array;
        for (var i = 0, r = this.mConnections; i < r.length; i++) {
            var n = r[i];
            this.EnqueueIncoming(new NetworkEvent(NetEventType.Disconnected, new ConnectionId(n), null))
        }
        this.mConnections = new Array;
        if (this.mServerStatus == WebsocketServerStatus.Starting) {
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, null))
        } else if (this.mServerStatus == WebsocketServerStatus.Online) {
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null))
        } else if (this.mServerStatus == WebsocketServerStatus.ShuttingDown) {
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null))
        }
        this.mServerStatus = WebsocketServerStatus.Offline;
        this.mOutgoingQueue = new Array;
        this.WebsocketCleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected
    };
    e.prototype.EnqueueOutgoing = function(e) {
        this.mOutgoingQueue.push(e)
    };
    e.prototype.EnqueueIncoming = function(e) {
        this.mIncomingQueue.push(e)
    };
    e.prototype.TryRemoveConnecting = function(e) {
        var t = this.mConnecting.indexOf(e.id);
        if (t != -1) {
            this.mConnecting.splice(t, 1)
        }
    };
    e.prototype.TryRemoveConnection = function(e) {
        var t = this.mConnections.indexOf(e.id);
        if (t != -1) {
            this.mConnections.splice(t, 1)
        }
    };
    e.prototype.HandleIncomingEvent = function(e) {
        if (e.Type == NetEventType.NewConnection) {
            this.TryRemoveConnecting(e.ConnectionId);
            this.mConnections.push(e.ConnectionId.id)
        } else if (e.Type == NetEventType.ConnectionFailed) {
            this.TryRemoveConnecting(e.ConnectionId)
        } else if (e.Type == NetEventType.Disconnected) {
            this.TryRemoveConnection(e.ConnectionId)
        } else if (e.Type == NetEventType.ServerInitialized) {
            this.mServerStatus = WebsocketServerStatus.Online
        } else if (e.Type == NetEventType.ServerInitFailed) {
            this.mServerStatus = WebsocketServerStatus.Offline
        } else if (e.Type == NetEventType.ServerClosed) {
            this.mServerStatus = WebsocketServerStatus.ShuttingDown;
            this.mServerStatus = WebsocketServerStatus.Offline
        }
        this.EnqueueIncoming(e)
    };
    e.prototype.HandleOutgoingEvents = function() {
        while (this.mOutgoingQueue.length > 0) {
            var e = this.mOutgoingQueue.shift();
            var t = NetworkEvent.toByteArray(e);
            this.mSocket.send(t)
        }
    };
    e.prototype.NextConnectionId = function() {
        var e = this.mNextOutgoingConnectionId;
        this.mNextOutgoingConnectionId = new ConnectionId(this.mNextOutgoingConnectionId.id + 1);
        return e
    };
    e.prototype.GetRandomKey = function() {
        var e = "";
        for (var t = 0; t < 7; t++) {
            e += String.fromCharCode(65 + Math.round(Math.random() * 25))
        }
        return e
    };
    e.prototype.Dequeue = function() {
        if (this.mIncomingQueue.length > 0) return this.mIncomingQueue.shift();
        return null
    };
    e.prototype.Peek = function() {
        if (this.mIncomingQueue.length > 0) return this.mIncomingQueue[0];
        return null
    };
    e.prototype.Update = function() {
        this.CheckSleep()
    };
    e.prototype.Flush = function() {
        if (this.mStatus == WebsocketConnectionStatus.Connected) this.HandleOutgoingEvents()
    };
    e.prototype.SendData = function(e, t, n) {
        if (e == null || t == null || t.length == 0) return;
        var i;
        if (n) {
            i = new NetworkEvent(NetEventType.ReliableMessageReceived, e, t)
        } else {
            i = new NetworkEvent(NetEventType.UnreliableMessageReceived, e, t)
        }
        this.EnqueueOutgoing(i)
    };
    e.prototype.Disconnect = function(e) {
        var t = new NetworkEvent(NetEventType.Disconnected, e, null);
        this.EnqueueOutgoing(t)
    };
    e.prototype.Shutdown = function() {
        this.Cleanup();
        this.mStatus = WebsocketConnectionStatus.NotConnected
    };
    e.prototype.Dispose = function() {
        if (this.mIsDisposed == false) {
            this.Shutdown();
            this.mIsDisposed = true
        }
    };
    e.prototype.StartServer = function(e) {
        if (e == null) {
            e = "" + this.GetRandomKey()
        }
        if (this.mServerStatus == WebsocketServerStatus.Offline) {
            this.EnsureServerConnection();
            this.mServerStatus = WebsocketServerStatus.Starting;
            this.EnqueueOutgoing(new NetworkEvent(NetEventType.ServerInitialized, ConnectionId.INVALID, e))
        } else {
            this.EnqueueIncoming(new NetworkEvent(NetEventType.ServerInitFailed, ConnectionId.INVALID, e))
        }
    };
    e.prototype.StopServer = function() {
        this.EnqueueOutgoing(new NetworkEvent(NetEventType.ServerClosed, ConnectionId.INVALID, null))
    };
    e.prototype.Connect = function(e) {
        this.EnsureServerConnection();
        var t = this.NextConnectionId();
        this.mConnecting.push(t.id);
        var n = new NetworkEvent(NetEventType.NewConnection, t, e);
        this.EnqueueOutgoing(n);
        return t
    };
    return e
}();

function bufferToString(e) {
    var t = new Uint16Array(e.buffer, e.byteOffset, e.byteLength / 2);
    return String.fromCharCode.apply(null, t)
}

function stringToBuffer(e) {
    var t = new ArrayBuffer(e.length * 2);
    var n = new Uint16Array(t);
    for (var i = 0, r = e.length; i < r; i++) {
        n[i] = e.charCodeAt(i)
    }
    var o = new Uint8Array(t);
    return o
}

function WebsocketNetwork_test1() {
    console.log("test1");
    var e = "test1234";
    var t = true;
    var n = false;
    var i;
    var r;
    if (window.location.protocol != "https:" && n) {
        i = "wss://because-why-not.com:12776";
        if (t) i = "ws://localhost:12776"
    } else {
        i = "wss://because-why-not.com:12777";
        if (t) i = "wss://localhost:12777"
    }
    var o = new WebsocketNetwork(i);
    o.StartServer();
    var a = new WebsocketNetwork(i);
    setInterval(function() {
        o.Update();
        var t = null;
        while (t = o.Dequeue()) {
            console.log("server inc: " + t.toString());
            if (t.Type == NetEventType.ServerInitialized) {
                console.log("server started. Address " + t.Info);
                a.Connect(t.Info)
            } else if (t.Type == NetEventType.ServerInitFailed) {
                console.error("server start failed")
            } else if (t.Type == NetEventType.NewConnection) {
                console.log("server new incoming connection")
            } else if (t.Type == NetEventType.Disconnected) {
                console.log("server peer disconnected");
                console.log("server shutdown");
                o.Shutdown()
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                o.SendData(t.ConnectionId, t.MessageData, true)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                o.SendData(t.ConnectionId, t.MessageData, false)
            }
        }
        o.Flush();
        a.Update();
        while (t = a.Dequeue()) {
            console.log("client inc: " + t.toString());
            if (t.Type == NetEventType.NewConnection) {
                console.log("client connection established");
                var n = stringToBuffer(e);
                a.SendData(t.ConnectionId, n, true)
            } else if (t.Type == NetEventType.ReliableMessageReceived) {
                var i = bufferToString(t.MessageData);
                if (i != e) {
                    console.error("Test failed sent string %s but received string %s", e, i)
                }
                var n = stringToBuffer(e);
                a.SendData(t.ConnectionId, n, false)
            } else if (t.Type == NetEventType.UnreliableMessageReceived) {
                var i = bufferToString(t.MessageData);
                if (i != e) {
                    console.error("Test failed sent string %s but received string %s", e, i)
                }
                console.log("client disconnecting");
                a.Disconnect(t.ConnectionId);
                console.log("client shutting down");
                a.Shutdown()
            }
        }
        a.Flush()
    }, 100)
}
console.log("Duality main.js");

const startButton = document.getElementById("startButton");
startButton.onclick = rtcCallTest;



function testLocalCamera() {
	console.log("testing local camera");
    FrameBuffer.DEBUG_SHOW_ELEMENTS = true;
    var e = new NetworkConfig;
    e.SignalingUrl = null;
    var mediaNet = new BrowserMediaNetwork(e);
    var n = new MediaConfig;
    n.Audio = true;
    n.Video = true;
    mediaNet.Configure(n);
    setInterval(function() {
        mediaNet.Update();
        var e = mediaNet.TryGetFrame(ConnectionId.INVALID);
        //console.log("width" + e.Width + " height:" + e.Height + " data:" + e.Buffer[0]);
        mediaNet.Flush()
    }, 50)
}

function testRemoteCamera() {
    FrameBuffer.DEBUG_SHOW_ELEMENTS = true;
    var netConf = new NetworkConfig;
    netConf.SignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";
    var t = new BrowserMediaNetwork(netConf);
    //var n = new BrowserMediaNetwork(e);
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
        var event;
        while ((event = t.Dequeue()) != null) {
            console.log("network1: " + event.toString());
            if (event.Type == NetEventType.NewConnection) {
                r = event.ConnectionId
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
        while ((event = n.Dequeue()) != null) {
            console.log("network2: " + event.toString());
            if (event.Type == NetEventType.NewConnection) {
                o = event.ConnectionId
            }
        }
        if (o != null) {
            i = n.TryGetFrame(o);
            if (i != null) console.log("remote2 width" + i.Width + " height:" + i.Height + " data:" + i.Buffer[0])
        }
        n.Flush()
        
    }, 50)
}

function rtcCallTest() {
    console.log("start");
    FrameBuffer.sUseLazyFrames = true;
    var conf = new NetworkConfig;
    conf.IsConference = true;
    conf.SignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";
    console.log("Using secure connection " + conf.SignalingUrl);
    var addr = getParameterByName("event");
    if (addr == null) {
        addr = GetRandomKey();
        window.location.href = window.location.href + "?event=" + addr;
        return
    }
    var rtcCall = new BrowserWebRtcCall(conf);
    var i = null;
    var r = {};
    rtcCall.addEventListener(function(o, event) {
        if (event.Type == CallEventType.ConfigurationComplete) {
            console.log("configuration complete")
        } else if (event.Type == CallEventType.FrameUpdate) {
            var s = event;
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
        } else if (event.Type == CallEventType.ListeningFailed) {
            if (conf.IsConference == false) {
                rtcCall.Call(addr)
            } else {
                console.error("Listening failed. Server dead?")
            }
        } else if (event.Type == CallEventType.ConnectionFailed) {
            alert("connection failed")
        } else if (event.Type == CallEventType.CallEnded) {
            var c = event;
            console.log("call ended with id " + c.ConnectionId.id);
            r[c.ConnectionId.id] = null
        } else {
            console.log(event.Type)
        }
    });
    
    rtcCall.Configure(new MediaConfig());
    rtcCall.Listen(addr);
    setInterval(function() {
        rtcCall.Update()
    }, 50);
}


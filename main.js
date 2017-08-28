console.log("Duality main.js");

const startButton = document.getElementById("startButton");
startButton.onclick = testRemoteCamera;



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

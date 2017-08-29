console.log("Duality main.js");

const startButton = document.getElementById("startButton");
startButton.onclick = rtcCall;

const isServerCheckBox = document.getElementById("isServerCheckBox");
const addrInput = document.getElementById("addrInput");

function rtcCall() {
    console.log("start");
    var isServer = isServerCheckBox.checked ? true : false;
	console.log("Is server? " + isServer); 
    FrameBuffer.sUseLazyFrames = true;
    var conf = new NetworkConfig;
    conf.IsConference = isServer;
    conf.SignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";
    console.log("Using secure connection " + conf.SignalingUrl);
    var addr = addrInput.value;
    if (addr == null) {
        addr = GetRandomKey();
        return;
    }
    console.log("Using address " + addr);
    var rtcCall = new BrowserWebRtcCall(conf);
    var videoElement = null;
    var connections = {};
    rtcCall.addEventListener(function(o, event) {
        if (event.Type == CallEventType.ConfigurationComplete) {
            console.log("configuration complete")
        } else if (event.Type == CallEventType.FrameUpdate) {
            var evt = event;
            if (videoElement == null && evt.ConnectionId == ConnectionId.INVALID) {
                var l = document.createElement("br");
                document.body.appendChild(l);
                console.log("local video added");
                var frame = evt.Frame;
                videoElement = frame.FrameGenerator.VideoElement;
                document.body.appendChild(videoElement)
            } else if (evt.ConnectionId != ConnectionId.INVALID && connections[evt.ConnectionId.id] == null) {
                console.log("remote video added");
                var frame = evt.Frame;
                connections[evt.ConnectionId.id] = frame.FrameGenerator.VideoElement;
                document.body.appendChild(connections[evt.ConnectionId.id]);
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
            var evt = event;
            console.log("call ended with id " + evt.ConnectionId.id);
            connections[evt.ConnectionId.id] = null
        } else {
            console.log(event.Type)
        }
    });
    setInterval(function() {
        rtcCall.Update()
    }, 50);
    rtcCall.Configure(new MediaConfig());
    rtcCall.Listen(addr);
    
}


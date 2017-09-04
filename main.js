console.log("Duality main.js");

const startButton = document.getElementById("startButton");
startButton.onclick = startPeer;
const stopButton =document.getElementById("stopButton");
stopButton.onclick = stopPeer;

const isServerCheckBox = document.getElementById("isServerCheckBox");
const addrInput = document.getElementById("addrInput");
const videoFrames = document.getElementById("videoFrames");
const content = document.getElementById("content");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const chat = document.getElementById("chat");

var rtcCall = null;

function startPeer() {
	chat.innerHTML = "";
	runPeer();
}

function runPeer() {
	
    var isServer = isServerCheckBox.checked ? true : false;
	printMsg("Starting " + (isServer? "server" : "client" ) + "...", "system");
    FrameBuffer.sUseLazyFrames = true;
    var conf = new NetworkConfig;
    conf.IsConference = isServer;
    conf.SignalingUrl = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";
    printMsg("Signaling : " + conf.SignalingUrl, "system");
    var addr = addrInput.value;
    if (addr == null) {
        addr = GetRandomKey();
        return;
    }
    printMsg("Using address '" + addr + "'", "system");
    rtcCall = new BrowserWebRtcCall(conf);
    var videoElement = null;
    var connections = {};
    rtcCall.addEventListener(function(o, event) {
        if (event.Type == CallEventType.ConfigurationComplete) {
            printMsg("configuration complete", "system");
            stopButton.disabled = false;
            startButton.disabled = true;
        } else if (event.Type == CallEventType.FrameUpdate) {
            var evt = event;
            if (videoElement == null && evt.ConnectionId == ConnectionId.INVALID) {
                var linebreak = document.createElement("br");
                content.appendChild(linebreak);
                printMsg("local video added", "system");
                var frame = evt.Frame;
                videoElement = frame.FrameGenerator.VideoElement;
                videoFrames.appendChild(videoElement)
            } else if (evt.ConnectionId != ConnectionId.INVALID && connections[evt.ConnectionId.id] == null) {
                printMsg("remote video added","system");
                var frame = evt.Frame;
                connections[evt.ConnectionId.id] = frame.FrameGenerator.VideoElement;
                videoFrames.appendChild(connections[evt.ConnectionId.id]);
                var linebreak = document.createElement("br");
               	content.appendChild(linebreak)
            }
        } else if (event.Type == CallEventType.ListeningFailed) {
            if (conf.IsConference == false) {
                rtcCall.Call(addr)
            } else {
                printMsg("Listening failed. Server dead?", "system")
            }
        } else if (event.Type == CallEventType.ConnectionFailed) {
            alert("connection failed");
        } else if (event.Type == CallEventType.CallEnded) {
            var evt = event;
            printMsg("call ended with id " + evt.ConnectionId.id, "system");
            connections[evt.ConnectionId.id] = null;
        }    
          else if (event.Type == CallEventType.Message) {
          	var evt = event;
          	console.log("message from " + evt.ConnectionId.id + " : " + evt.Content);
          	printMsg(evt.Content, "other");
        } else {
            console.log("got unhandled event type " + event.Type);
        }
    });
    setInterval(function() {
        rtcCall.Update()
    }, 50);
    rtcCall.Configure(new MediaConfig());
    rtcCall.Listen(addr);
}

function stopPeer() {
	if (!rtcCall) return; 
	rtcCall.Dispose();
	stopButton.disabled = true;
	startButton.disabled = false;
}

function printMsg(txt, classId) {
  chat.innerHTML += "<span class = " + classId + "> " + txt + "</span><br>";
}
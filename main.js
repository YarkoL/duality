/*
Functionality to establish webRTC media and data exchange with 
the corresponding Unity Plugin

author : jarkko lehto
last rev. 07-08-17 

*/

console.log("Duality main.js");

/*
initialization
*/

//the main content div, used to append video in
const content = document.getElementById("content");

//string : address token for both peers to find each other
const addrInput = document.getElementById("addrInput"); 

//boolean : whether this listens for inbound videoElements (is server)
// or makes an outbound connnnection (is client). Tracks who starts the conversattion
const isServerCheckBox = document.getElementById("isServerCheckBox");

//starts the peer and all webRTC functionality
const startButton = document.getElementById("startButton");

//stops the peer
const stopButton =document.getElementById("stopButton");

//string : input text message
const chatInput = document.getElementById("chatInput");

//two canvas elements, for local and remote. Video stream 
//is rendered on them. See CreateFrame in FrameBuffer 
const videoFrames = document.getElementById("videoFrames");

//send text message
const sendButton = document.getElementById("sendButton");

//text messages and some debug info are written into the chat window
const chat = document.getElementById("chat");

//onClick event handlers
startButton.onclick = StartPeer;
stopButton.onclick = StopPeer;
sendButton.onclick = SendText;

//the call object, instance of BrowserWebRtcCall
var rtcCall = null;

/*
StartPeer
- only needed because we need to clear up the chat window contents 
outside the actual peer operation
*/
function StartPeer() 
{
	chat.innerHTML = "";
	RunPeer();ConnectionId
}

/*
StopPeer 
- disposes the existing call and does UI cleanup
*/
function StopPeer()
{
	if (rtcCall == false) 
	{
		AppendToChat("Could not dispose peer", "system");
	} 
	else 
	{
		rtcCall.Dispose();
	}
	stopButton.disabled = true;
	startButton.disabled = false;
	chatInput.disabled = true;
    sendButton.disabled = true;
}

/*
SendText
- read the input text form and clear
*/
function SendText()
{
	var message = chatInput.value;
	AppendToChat(message, "me");
	rtcCall.Send(message);
	console.log("sent message " + message);
	chatInput.value = "";
}

/*
AppendToChat 
- prints color-coded messages to the chat window

args:
	txt - string to be outputted
	classId - styles defined in main.css, appear in different colors.
	 	Values are:
		system - for debug info
        other - text messages from Unity plugin
        me - my text messages
*/

function AppendToChat(txt, classId) 
{ 
  chat.innerHTML += "<span class = " + classId + "> " + txt + "</span><br>";
}

function RunPeer() 
{	
	var addr = addrInput.value;
    if (addr == null) 
    {
        AppendToChat("Please enter an address", "system");
        return;
    }
    //TODO explain this
    FrameBuffer.sUseLazyFrames = true;
    var conf = new NetworkConfig;
    conf.IsConference = isServerCheckBox.checked;

    //display some info
    AppendToChat("Starting " + (conf.IsConference? "server" : "client" ) + "...", "system");    
    console.log("Signaling url: " + conf.SignalingUrl);
    AppendToChat("Using address '" + addr + "'", "system");
    
    rtcCall = new BrowserWebRtcCall(conf);

    //UI element that contains the video, see SetupVideoElement 
    var videoElement = null;
    //array for videoelements containing active connections
    var videoElements = {};

    rtcCall.addEventListener(function(obj, event) 
    {
        var evt = event;
        switch(event.Type) 
        {
            case CallEventType.ConfigurationComplete :
                //UI changes, opposite of StopPeer
                stopButton.disabled = false;
                startButton.disabled = true;
                chatInput.disabled = false;
                sendButton.disabled = false;
                AppendToChat("configuration complete", "system");
                break;

            case CallEventType.FrameUpdate :
                videoElement = evt.Frame.FrameGenerator.VideoElement;
               
                if (videoElement == null && evt.ConnectionId == ConnectionId.INVALID) 
                {
                    AppendToChat("local video added", "system"); //TODO unclear if it ever goes in here
                } 
                else if (evt.ConnectionId != ConnectionId.INVALID && videoElements[evt.ConnectionId.id] == null)
                {
                    AppendToChat("remote video added","system");
                    videoElements[evt.ConnectionId.id] = videoElement;       
                }
                videoFrames.appendChild(videoElement);
                var linebreak = document.createElement("br");
                content.appendChild(linebreak)
                break;

            case CallEventType.Message :
                AppendToChat(evt.Content, "other");
                console.log("message from " + evt.ConnectionId.id + " : " + evt.Content);
                break;

            case CallEventType.ListeningFailed :
                if (conf.IsConference == false) 
                {
                    rtcCall.Call(addr);
                } 
                else 
                {
                    AppendToChat("Listening failed. Server dead?", "system");
                }
                break;

            case CallEventType.CallEnded : 
                AppendToChat("call ended with id " + evt.ConnectionId.id, "system");
                videoElements[evt.ConnectionId.id] = null;
                break;    

            case CallEventType.ConnectionFailed :
                alert("Connection failed");
		console.log(conf);
                break;

            default :
                console.log("got unhandled event type " + event.Type);
        }
    });
    setInterval(function() {
        rtcCall.Update()
    }, 50);
    rtcCall.Configure(new MediaConfig());
    rtcCall.Listen(addr);
}


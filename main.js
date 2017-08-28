console.log("Duality main.js");

const roomInput = document.getElementById('roomInput');
const chatInput = document.getElementById('chatInput');
const joinButton = document.getElementById('joinButton');
const openButton = document.getElementById('openButton');
const sendButton = document.getElementById('sendButton');
const shutdownButton = document.getElementById('shutdownButton');
const chat = document.getElementById('chat');

openButton.onclick = open;
joinButton.onclick = join;
sendButton.onclick = send;
shutdownButton.onclick = shutdown;


var conf =  {'iceServers':[{
	'urls':'turn: remotesupport.northeurope.cloudapp.azure.com',
	'username': 'remotesupport',
	'credential': 'h0lolens'
	}]};
var uri = "wss://remotesupport.northeurope.cloudapp.azure.com:12777";

var isServer = false;
var peer = null; //this user
var id = null; //the other one
var room = "";
var timer = null;

//printMessage("Welcome!", "system");

function open() {
	room = roomInput.value;
	console.log("opened room " + room);
	peer = new WebRtcNetwork(new SignalingConfig(new WebsocketNetwork(uri)), conf);
	peer.StartServer(room);
	isServer = true;
	joinButton.disabled = true;
	sendButton.disabled = false;
	shutdownButton.disabled = false;
	listenForEvents();
}

function join() {
	room = roomInput.value;
	console.log("joined room " + room);
	peer = new WebRtcNetwork(new SignalingConfig(new WebsocketNetwork(uri)), conf);
	peer.Connect(room)
	openButton.disabled = true;
	sendButton.disabled = false;
	shutdownButton.disabled = false;
	listenForEvents();
}

function listenForEvents() {
	 timer = setInterval(function() {
	    peer.Update();
	    var event = null;
	    while (event = peer.Dequeue()) {
	        console.log("inc: " + event.toString());
	        if (event.Type == NetEventType.ServerInitialized) {
	            printMessage("Opened room  " + event.Info, "system");
	        } else if (event.Type == NetEventType.ServerInitFailed) {addMessage
	            console.error("server start failed")
	        } else if (event.Type == NetEventType.NewConnection) {
	        	id = event.ConnectionId;
	        	printMessage("New user got online!", "system")
	            console.log("new connection, id " + id.toLocaleString());
	        } else if (event.Type == NetEventType.Disconnected) {
	            console.log("peer disconnected");event	 
	        } else if (event.Type == NetEventType.ReliableMessageReceived) {
	        	//var msg = bufferToString(event.MessageData);
	        	var msg = byteArrayToString(event.MessageData);
	        	printMessage(msg, "other");
	        } 
	    }
	    peer.Flush()
	}, 100);
}

function send() {
	var message = chatInput.value;
	printMessage(message, "me");
	if (id) {
		//var arr = stringToBuffer(message);
		var arr = stringToByteArray(message); 
		peer.SendData(id, arr, true);
	} else {
		printMessage("Sorry, failed to send!", "system")
	}
	console.log("sent message " + message);
	chatInput.value = "";
}

function printMessage(txt, classId) {
  chat.innerHTML += "<span class = " + classId + "> " + txt + "</span><br>";
}

function shutdown() {
	console.log("shutdown");
	sendButton.disabled = true;
	shutdownButton.disabled = true;
	openButton.disabled = false;
	joinButton.disabled = false;
	
	clearInterval(timer);
	peer.Disconnect(id);
	peer.Shutdown();
	peer = null;
	id = null;

}

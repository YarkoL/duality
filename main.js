console.log("Duality main.js");

myTest();


function myTest() {
    console.log("test1");
    var teststring = "test1234";
    //var uri = 
    /*
    var serverConf = {
        iceServers: [{
            urls: ["stun:stun.l.google.com:19302"]
        }]
    };
    */
    var serverConf = null;
    
    var server = new WebRtcNetwork(new SignalingConfig(new LocalNetwork), serverConf);
    server.StartServer();
    var client = new WebRtcNetwork(new SignalingConfig(new LocalNetwork), serverConf);
    setInterval(function() {
        server.Update();
        var event = null;
        while (event = server.Dequeue()) {
            console.log("server inc: " + event.toString());
            if (event.Type == NetEventType.ServerInitialized) {
                console.log("server started. Address " + event.Info);
                client.Connect(event.Info)
            } else if (event.Type == NetEventType.ServerInitFailed) {
                console.error("server start failed")
            } else if (event.Type == NetEventType.NewConnection) {
                console.log("server new incoming connection")
            } else if (event.Type == NetEventType.Disconnected) {
                console.log("server peer disconnected");event
                console.log("server shutdown");
                server.Shutdown()
            } else if (event.Type == NetEventType.ReliableMessageReceived) {
                server.SendData(event.ConnectionId, event.MessageData, true)
            } else if (event.Type == NetEventType.UnreliableMessageReceived) {
                server.SendData(event.ConnectionId, event.MessageData, false)
            }
        }
        server.Flush();
        client.Update();
        while (event = client.Dequeue()) {
            console.log("client inc: " + event.toString());
            if (event.Type == NetEventType.NewConnection) {
                console.log("client connection established");
                var serverConf = stringToBuffer(teststring);
                client.SendData(event.ConnectionId, serverConf, true)
            } else if (event.Type == NetEventType.ReliableMessageReceived) {
                var r = bufferToString(event.MessageData);
                if (r != teststring) {
                    console.error("Test failed sent string %s but received string %s", teststring, r)
                }
                var testBuf = stringToBuffer(teststring);
                client.SendData(event.ConnectionId, testBuf, false)
            } else if (event.Type == NetEventType.UnreliableMessageReceived) {
                var r = bufferToString(event.MessageData);
                if (r != teststring) {
                    console.error("Test failed sent string %s but received string %s", teststring, r)
                }
                console.log("client disconnecting");
                client.Disconnect(event.ConnectionId);
                console.log("client shutting down");
                client.Shutdown()
            }
        }
        client.Flush()
    }, 100)
}


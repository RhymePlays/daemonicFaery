import { io } from "socket.io-client";

export class SocketPortClient{
    constructor(ip="localhost", port=80, opts={}){
        this.ip=ip||"localhost";
        this.port=port||80;
        this.opts=opts||{};
        this.disconnectReason="";

        this.passport={
            passVer: "1.0",
            handler: this.opts.handlerDaemon||"DaemonName",
            data: this.opts.dataForHandler||{},
            authCreds: this.opts.authCreds||{user:undefined, pass:undefined}
        };
        this.onConnectCallback=this.opts.onConnectCallback||this.emptyCallback;
        this.onDisconnectCallback=this.opts.onDisconnectCallback||this.emptyCallback;
        this.onReceiveCallback=this.opts.onReceiveCallback||this.emptyCallback;

        this.connect();
    }

    send(type, payload){this.wsClient.emit("serverReceiver", {type: type, payload, payload});}
    emptyCallback(arg=false){}
    connect(){
        this.wsClient = io(`ws://${this.ip}:${this.port}`);

        this.wsClient.once("connect", ()=>{
            this.wsClient.once("passportRequested", ()=>{
                this.wsClient.emit("passport", this.passport);
                this.wsClient.once("passportAccepted", ()=>{
                    this.onConnectCallback();
                });
            });
        
            this.wsClient.on("clientReceiver", (data)=>{
                data=data||{};
                this.onReceiveCallback(data.type, data.payload);
            });

            this.wsClient.once("disconnectReason", (data)=>{
                this.disconnectReason=data;
            });this.wsClient.once("disconnect", ()=>{
                this.onDisconnectCallback(this.disconnectReason);
                delete this.wsClient;
            });
        });
    }
    disconnect(){
        this.wsClient.disconnect();
    }
}
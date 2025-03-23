import { DaemonicDaemon } from "../daemonicFaery.ts";
import { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { SocketPortClient } from "../daemonDependencies/SocketPortClient.js";

export class SocketPort extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    onLoad(){
        this.variables = {
            client:{
                handlers: {},
                sockets: {}
            },
            server:{
                handlers: {},
                sockets: {}
            }
        }
    }
    start(){
        // Server ----
        if(this.daemonicFaeryInstance.getDaemonStatus("WebPort").isActive && !(this.config.server||{}).dontUseWebPort){
            this.sender("WebPort", "getHttpServerInstance", undefined, undefined, (httpServerInstance:any)=>{
                this.pushLog("Hosting on top of WebPort");
                this.startServer(httpServerInstance, {});
            });
        }else{
            this.pushLog("Hosting Solo");
            this.startServer((this.config.server||{}).port||85, {cors: {origin: "*", methods: ["GET", "POST"]}});
        }
    }
    stop(){this.variables.wsServer.close();}
    receiver(from:string, signal:string, data:any, ID:string){
        

        /*------------*\
        |    Server    |
        \*------------*/
        
        if(signal=="addHandler"){ // data -> {onConnect:str, onDisconnect:str, onReceive:str}
            this.pushLog(`Handler '${data}' registered`);
            this.variables.server.handlers[from]={
                onConnect: data.onConnect||"onSocketConnect",
                onDisconnect: data.onDisconnect||"onSocketDisconnect",
                onReceive: data.onReceive||"onSocketReceive",
                sockets: []
            };
        }if(signal=="removeHandler"){ // data -> daemonName:str
            if(data in this.variables.server.handlers){
                this.pushLog(`Handler '${data}' unregistered by '${from}'`);
                for (let i=0;i<this.variables.server.handlers[data].sockets.length;i++){
                    this.variables["wsServer"].to(this.variables.server.handlers[data].sockets[i]).emit("disconnectReason", "Handler Removed");
                    this.variables["wsServer"].to(this.variables.server.handlers[data].sockets[i]).disconnect();
                }
                delete this.variables.server.handlers[data];
            }
        }else if(signal=="sendToSocket"){ // data -> {socketID:str, data:any}
            /* [Can only send to sockets registered to this handler] */
            if(((this.variables.server.handlers[from]||{}).sockets||[]).includes(data.socketID)){
                this.pushLog(`Data sent from '${from}' to '${data.socketID}'`);
                this.variables["wsServer"].to(data.socketID).emit("clientReceiver", data.data);
            }
        }else if(signal=="removeSocket"){ // data -> socketID:str
            if(data in this.variables.server.sockets){
                this.pushLog(`Socket '${data}' removed by '${from}'`);
                this.variables["wsServer"].to(data).emit("disconnectReason", "Removal Requested");
                this.variables["wsServer"].to(data).disconnect();
            }
        }


        /*------------*\
        |    Client    |
        \*------------*/

        else if(signal=="connectToServer"){ // data -> {ip, port, opts, onConnect:str, onDisconnect:str, onReceive:str}
            this.startClient(from, data.ip, data.port, data.opts, data.onConnect, data.onDisconnect, data.onReceive);
        }else if(signal=="disconnectFromServer"){ // data -> socketID:str
            if(data in this.variables.client.sockets){this.variables.client.sockets[data].disconnect();}
        }else if(signal=="removeClientHandler"){ // data -> daemonName
            if(data in this.variables.client.handlers){
                this.pushLog(`Client Handler '${data}' unregistered by '${from}'`);
                for (let i=0;i<this.variables.client.handlers[data].length;i++){
                    this.variables.client.sockets[this.variables.client.handlers[data][i]].disconnect();
                }
                delete this.variables.client.handlers[data];
            }
        }else if(signal=="sendToServer"){ // data -> {socketID:str, data:any}
            /* [Can only send to sockets registered to this handler] */
            if((this.variables.client.handlers[from]||[]).includes(data.socketID)){
                this.variables.client.sockets[data.socketID].send(data.data);
            }
        }

    }


    startServer(serverOrPort:any, opts:{}){
        this.variables["wsServer"] = new Server(serverOrPort, opts);

        this.variables.wsServer.on("connection", (socket:Socket)=>{
            // Checking Passport and Adding Socket
            let passportTimeout = setTimeout(()=>{socket.emit("disconnectReason", "Passport Timeout");socket.disconnect();}, (this.config.server||{}).passportTimeout||10000);
            socket.emit("passportRequested", true);
            socket.once("passport", (passport)=>{ // REQ -> {passVer:str, handler:str, data:obj, authCreds?:{user:str,pass:str}}
                if ((passport.handler in this.variables.server.handlers) && this.authCheck(passport.authCreds)){
                    clearTimeout(passportTimeout);
                    this.variables.server.sockets[socket.id] = passport.handler;
                    this.variables.server.handlers[passport.handler].sockets.push(socket.id);
                    this.pushLog(`Socket '${socket.id}' Accepted!`);
                    this.sender(
                        passport.handler,
                        this.variables.server.handlers[passport.handler].onConnect,
                        {socketID:socket.id, data:passport.data}
                    );
                    socket.emit("passportAccepted", true);
                }else{
                    this.pushLog(`Socket '${socket.id}' Rejected!`);
                    socket.emit("disconnectReason", "Passport Rejected");
                    socket.disconnect();
                }
            });

            // Removing Socket
            socket.once("disconnect", ()=>{
                this.pushLog(`Socket '${socket.id}' Disconnected!`);
                if (socket.id in this.variables.server.sockets){
                    if (this.variables.server.sockets[socket.id] in this.variables.server.handlers){ // Not Required, but safer to have it
                        this.sender(
                            this.variables.server.sockets[socket.id],
                            this.variables.server.handlers[this.variables.server.sockets[socket.id]].onDisconnect,
                            {socketID:socket.id}
                        );
                    }

                    let handlerSockets = this.variables.server.handlers[this.variables.server.sockets[socket.id]].sockets;
                    handlerSockets.splice(handlerSockets.indexOf(socket.id), 1);
                }
                
                delete this.variables.server.sockets[socket.id];
            });

            // OnReceive
            socket.on("serverReceiver", (data)=>{
                this.sender(
                    this.variables.server.sockets[socket.id],
                    this.variables.server.handlers[this.variables.server.sockets[socket.id]].onReceive,
                    {socketID:socket.id, data:data}
                );
            });
        });
    }

    startClient(daemonName:string, ip:string="localhost", port:number=80, opts:any={}, onConnect:string, onDisconnect:string, onReceive:string){
        try{
            let socketID = randomUUID();
            
            if (daemonName in this.variables.client.handlers){
                this.variables.client.handlers[daemonName].push(socketID);
            }else{
                this.variables.client.handlers[daemonName] = [socketID];
            }
            
            this.variables.client.sockets[socketID] = new SocketPortClient(ip, port, {
                handlerDaemon: opts.handlerDaemon,
                dataForHandler: opts.dataForHandler,
                authCreds: opts.authCreds,
                onConnectCallback: ()=>{
                    this.pushLog(`Connected to Server '${socketID}' at the request of '${daemonName}'`);
                    this.sender(daemonName, onConnect, socketID);
                },
                onDisconnectCallback: (data:string)=>{
                    this.pushLog(`Disconnected from Server '${socketID}' (registered by '${daemonName}')`);
                    this.sender(daemonName, onDisconnect, data);
                    
                    this.variables.client.handlers[daemonName].splice(this.variables.client.handlers[daemonName].indexOf(socketID), 1);
                    delete this.variables.client.sockets[socketID];
                },
                onReceiveCallback: (data:any)=>{
                    this.sender(daemonName, onReceive, data);
                }
            });
        }catch(e){
            this.pushLog(`Error connecting to Server '${ip}:${port}' (requested by '${daemonName}')`, false);
        }
    }

    authCheck(authCreds:any):Boolean{
        if ((this.config.server||{}).enableAuth){
            let returnValue:Boolean = false;
            this.sender("AuthCTL", "validateUser", authCreds, undefined, (data:boolean)=>{returnValue=data;});
            return returnValue;
        }else{
            return true;
        }
    }
}

// Switch to Switch-Case
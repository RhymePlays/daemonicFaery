import { DaemonicDaemon } from "../daemonicFaery.ts";
import { randomUUID } from "node:crypto";
import { readFile, writeFileSync } from "node:fs";

export class DaemonicChat extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies: AuthCTL, SocketPort, WebPort

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    start(){
        this.config.maxChatSize=this.config.maxChatSize||50;
        this.variables["SPToUserMap"]={};
        this.variables["SPToChannelMap"]={};
        this.variables["chatDB"]={};
        this.addChannel(this.config.defaultChannel||"Default", true, true);
        this.addChannel("Anime", true, true);
        

        // ChatDB
        if (this.config.chatDBLocation){
            readFile(this.config.chatDBLocation, "utf-8", (error, data)=>{if (!error && data){
                try{
                    this.variables.chatDB=JSON.parse(data);
                    this.pushLog(`ChatData: Read from file.`);
                }catch(e){
                    this.pushLog(`ChatData: Couldn't decode file. Probably not in JSON.`, false);
                }
            }else{
                this.pushLog(`ChatData: Couldn't reading file. Probably doesn't exist.`, false);
            }});
        }else{
            this.pushLog(`ChatData: No file location set for the ChatDB file`, false);
        }
        this.variables.requiresSaving=false;
        this.variables.chatDBSaveInterval = setInterval(()=>{if(this.variables.requiresSaving){this.saveChatDB();}}, this.config.saveInterval||10*60*1000);


        // PageHTML
        this.variables.pageHTML = "Failed to load page";
        readFile(this.config.pageLocation, "utf-8", (error, data)=>{if (!error && data){this.variables.pageHTML = data;}});

        
        // WebPort
        this.sender("WebPort", "addListener", {
            webSignal: "daemonicChat",
            respondWithSignal: "daemonicChatCalled",
            willRespond: true,
            description: "DaemonicChat Page"
        });

        // SocketPort
        this.sender("SocketPort", "addHandler", {
            onConnect: "onSocketConnect",
            onDisconnect: "onSocketDisconnect",
            onReceive: "onSocketReceive"
        });
    }
    stop(){
        this.sender("WebPort", "removeListener", "daemonicChat");
        clearInterval(this.variables.chatDBSaveInterval);
    }
    receiver(from:string, signal:string, data:any, ID:string){
        // WebPort
        if(signal=="daemonicChatCalled"){
            this.sender("WebPort", "sendWebResponse", {
                webSignal: "daemonicChat",
                webResponse: this.variables.pageHTML,
                isHTML: true
            });
        }
        
        // SocketPort
        else if(signal=="onSocketConnect"){
            this.sender("AuthCTL", "validateUser", data.passport.authCreds, undefined, (authorized:boolean)=>{
                if(authorized){
                    this.sender("SocketPort", "sendToSocket", {
                        socketID: data.socketID,
                        type: "authCB",
                        payload: {authed: authorized}
                    });
                    this.variables.SPToUserMap[data.socketID]={user: data.passport.authCreds.user, isGuest:false};
                }else{
                    let guestCreds = {user:"guest_"+data.socketID, pass:randomUUID()};
                    this.sender("AuthCTL", "addUser", guestCreds);
                    this.sender("SocketPort", "sendToSocket", {
                        socketID: data.socketID,
                        type: "authCB",
                        payload: {authed: authorized, guestCreds: guestCreds}
                    });
                    this.variables.SPToUserMap[data.socketID]={user: guestCreds.user, isGuest:true};
                }
            });
        }else if(signal=="onSocketDisconnect"){
            if (this.variables.SPToUserMap[data.socketID].isGuest){
                this.sender("AuthCTL", "removeUser", this.variables.SPToUserMap[data.socketID].user);
            }
            this.removeUserListenJobs(data.socketID);
            delete this.variables.SPToUserMap[data.socketID];
        }else if(signal=="onSocketReceive"){
            data.payload=data.payload||{};

            if(data.type=="getTexts"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    if (authorized && (data.payload.channel in this.variables.chatDB)){
                        let allowedToRead = false;
                        if (typeof(this.variables.chatDB[data.payload.channel].readAllowedUsers)=="boolean"){
                            allowedToRead=this.variables.chatDB[data.payload.channel].readAllowedUsers;
                        }else{
                            if(this.variables.chatDB[data.payload.channel].readAllowedUsers.includes(data.payload.userCreds.user)){
                                allowedToRead=true;
                            }
                        }
                        if (allowedToRead){
                            this.sender("SocketPort", "sendToSocket", {
                                socketID: data.socketID,
                                type: "getTextsCB",
                                payload: this.getTexts(
                                    data.payload.channel,
                                    data.payload.startIndex,
                                    data.payload.totalCount
                                )}
                            );
                        }
                    }
                });
            }else if(data.type=="pushText"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    this.pushText(
                        data.payload.channel,
                        data.payload.userCreds.user,
                        data.payload.type,
                        data.payload.data
                    );
                });
            }else if(data.type=="removeText"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    this.removeText(
                        data.payload.channel,
                        data.payload.userCreds.user,
                        data.payload.textId
                    );
                });
            }else if(data.type=="addPerms"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    if(authorized && (data.payload.channel in this.variables.chatDB)){
                        this.addPerms(
                            data.payload.channel,
                            data.payload.user,
                            data.payload.role,
                        );
                    }
                });
            }else if(data.type=="removePerms"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    if(authorized && (data.payload.channel in this.variables.chatDB)){
                        this.removePerms(
                            data.payload.channel,
                            data.payload.user,
                            data.payload.role
                        );
                    }
                });
            }else if(data.type=="setChannel"){
                this.sender("AuthCTL", "validateUser", data.payload.userCreds, undefined, (authorized:boolean)=>{
                    if(authorized && (data.payload.channel in this.variables.chatDB)){
                        this.removeUserListenJobs(data.socketID);

                        let allowedToRead=false;
                        if (typeof(this.variables.chatDB[data.payload.channel].readAllowedUsers)=="boolean"){
                            allowedToRead=this.variables.chatDB[data.payload.channel].readAllowedUsers;
                        }else{
                            if(this.variables.chatDB[data.payload.channel].readAllowedUsers.includes(data.payload.userCreds.user)){
                                allowedToRead=true;
                            }
                        }

                        if(allowedToRead){
                            this.variables.chatDB[data.payload.channel].activeSPListeners.push(data.socketID);
                            this.variables.SPToChannelMap[data.socketID]=data.payload.channel;
                        }
                    }
                });
            }else if(data.type=="getChannels"){
                this.sender("SocketPort", "sendToSocket", {
                    socketID: data.socketID,
                    type: "getChannelsCB",
                    payload: Object.keys(this.variables["chatDB"])
                });
            }else if(data.type=="addChannel"){
                this.sender("AuthCTL", "validateTOTP", data.payload.totp||"", undefined, (authorized:boolean)=>{
                    if(authorized){this.addChannel(data.payload.channel);}
                })
            }else if(data.type=="removeChannel"){
                this.sender("AuthCTL", "validateTOTP", data.payload.totp||"", undefined, (authorized:boolean)=>{
                    if(authorized){this.removeChannel(data.payload.channel);}
                });
            }
        }


        // ToDo: Interface the chat system with IDC.
    }


    private saveChatDB(){
        this.variables.requiresSaving=false;
        try{
            writeFileSync(this.config.chatDBLocation, JSON.stringify(this.variables.chatDB));
            this.pushLog(`ChatDB saved to file`);
        }catch(e){
            this.pushLog(`Error saving ChatDB to file`, false);
        }
    }
    private sendTextToChannelListeners(channel:string, textId:string, text:any){
        if (channel in this.variables.chatDB){
            for (let i=0;i<this.variables.chatDB[channel].activeSPListeners.length;i++){
                this.sender("SocketPort", "sendToSocket", {
                    socketID: this.variables.chatDB[channel].activeSPListeners[i],
                    type: "newTextCB",
                    payload: Object.assign(text, {id: textId})
                });
            }
        }
    }
    private removeUserListenJobs(socketID:string){
        if (this.variables.SPToChannelMap[socketID]!=undefined){
            let index=this.variables.chatDB[this.variables.SPToChannelMap[socketID]].activeSPListeners.indexOf(socketID);
            if (index>=0){
                this.variables.chatDB[this.variables.SPToChannelMap[socketID]].activeSPListeners.splice(index, 1);
                delete this.variables.SPToChannelMap[socketID];
            }
        }
    }

    private cleanChannel(channel:string){
        this.variables.chatDB[channel].order.push();
        while(this.variables.chatDB[channel].order.length > this.config.maxChatSize){
            let textId=this.variables.chatDB[channel].order.shift();
            delete this.variables.chatDB[channel].texts[textId];
        }
    }
    private addChannel(channel:string, readAllowedUsers:any=undefined, writeAllowedUsers:any=undefined){
        if (typeof(channel)=="string" && !(channel in this.variables.chatDB)){
            this.variables.chatDB[channel]={
                "activeSPListeners": [],
                "readAllowedUsers": readAllowedUsers||[],
                "writeAllowedUsers": writeAllowedUsers||[],
                "order": [],
                "texts": {}
            }
            this.variables.requiresSaving=true;
        }
    }
    private removeChannel(channel:string){
        if (channel in this.variables.chatDB){
            delete this.variables.chatDB[channel];
            this.variables.requiresSaving=true;
        }
    }
    private addPerms(channel:string, user:string, role:string){
        this.sender("AuthCTL", "getUserData", user, undefined, (userData:any)=>{
            if (channel in this.variables.chatDB && userData.exists){
                if (role=="read"){
                    if(typeof(this.variables.chatDB[channel].readAllowedUsers)=="object"){
                        let index = this.variables.chatDB[channel].readAllowedUsers.indexOf(user);
                        (index<0)?this.variables.chatDB[channel].readAllowedUsers.push(user):undefined;
                        this.variables.requiresSaving=true;
                    }
                }else if(role=="write"){
                    if(typeof(this.variables.chatDB[channel].readAllowedUsers)=="object"){
                        let index = this.variables.chatDB[channel].writeAllowedUsers.indexOf(user);
                        (index<0)?this.variables.chatDB[channel].writeAllowedUsers.push(user):undefined;
                        this.variables.requiresSaving=true;
                    }
                }
            }
        });
    }
    private removePerms(channel:string, user:string, role:string){
        this.sender("AuthCTL", "getUserData", user, undefined, (userData:any)=>{
            if (channel in this.variables.chatDB && userData.exists){
                if (role=="read"){
                    if(typeof(this.variables.chatDB[channel].readAllowedUsers)=="object"){
                        let index = this.variables.chatDB[channel].readAllowedUsers.indexOf(user);
                        (index>=0)?this.variables.chatDB[channel].readAllowedUsers.splice(index, 1):undefined;
                        this.variables.requiresSaving=true;

                        let SPIndex = Object.values(this.variables.SPToUserMap).indexOf(user);
                        if(SPIndex>=0){this.removeUserListenJobs(Object.keys(this.variables.SPToUserMap)[SPIndex]);}
                    }
                }else if(role=="write"){
                    if(typeof(this.variables.chatDB[channel].writeAllowedUsers)=="object"){
                        let index = this.variables.chatDB[channel].writeAllowedUsers.indexOf(user);
                        (index>=0)?this.variables.chatDB[channel].writeAllowedUsers.splice(index, 1):undefined;
                        this.variables.requiresSaving=true;
                    }
                }
            }
        });
    }
    private getTexts(channel:string, startIndex:number, totalCount:number):any{
        let returnValue:any=[];
        for (let i=0;i<totalCount;i++){
            if (startIndex+i < this.variables.chatDB[channel].order.length){
                let textId = this.variables.chatDB[channel].order[this.variables.chatDB[channel].order.length-(startIndex+i)-1];
                returnValue.push(Object.assign(this.variables.chatDB[channel].texts[textId], {id: textId}));
            }else{
                break
            }
        }
        return returnValue;
    }
    private removeText(channel:string, nameOrForce:string|boolean, textId:string){
        if (channel in this.variables.chatDB){
            if (textId in this.variables.chatDB[channel].texts){
                if (nameOrForce==true || this.variables.chatDB[channel].texts[textId].user==nameOrForce){
                    delete this.variables.chatDB[channel].texts[textId];
                    this.variables.chatDB[channel].order.splice(this.variables.chatDB[channel].order.indexOf(textId), 1);
                    this.variables.requiresSaving=true;
                }
            }
        }
    }
    private pushText(channel:string, name:string, type:string, data:string){
        if (typeof(data)=="string"){
            if (data.length>0 && data.length<8192){
                    if (channel in this.variables.chatDB){
                        let allowedToWrite=false;
                        if (typeof(this.variables.chatDB[channel].writeAllowedUsers)=="boolean"){
                            allowedToWrite=this.variables.chatDB[channel].writeAllowedUsers;
                        }else{
                            if (this.variables.chatDB[channel].writeAllowedUsers.includes(name)){
                                allowedToWrite=true;
                            }
                        }
                        
                        if (allowedToWrite){
                            let textId = randomUUID();
                            this.variables.chatDB[channel].order.push(textId);
                            this.variables.chatDB[channel].texts[textId]={ 
                                time: Date.now(),
                                user: name,
                                type: type,
                                data: data,
                            };
                            this.sendTextToChannelListeners(channel, textId, this.variables.chatDB[channel].texts[textId]);
                            this.cleanChannel(channel);
                            this.variables.requiresSaving=true;
                        }
                    }
            }
        }
    }
}
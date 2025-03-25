import { readFile, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import chalk from "chalk";

interface daemonDefinitionInterface{fileLocation:string;daemonName:string;configs?:object;}
interface daemonicFaeryConfigInterface{hostname?:string,daemonDefinitions?:daemonDefinitionInterface[]}
export class DaemonicFaery{
    // Configurable
    private hostname: string = "RyServer";
    private daemonDefinitions: daemonDefinitionInterface[] = [];
    
    // Non-Configurable
    private version:string = "2025.2.0";
    private startTime:number = Date.now();
    private daemons:{[key: string]: DaemonicDaemon} = {};


    // Constructor
    constructor(config: daemonicFaeryConfigInterface | string){

        /*--Loading Config [Step-1]--*/
        if (typeof(config)=="string"){
            let returnValue:daemonicFaeryConfigInterface={};
            if (existsSync(config)){
                readFile(config, "utf-8", (error, data)=>{
                    if (!error && data){
                        try{
                            returnValue=JSON.parse(data);
                            this.pushLog("Config: Read from file.");
                            this.loadConfig(returnValue);
                        }catch(e){
                            this.pushLog("Config: Couldn't decode file. Probably not in JSON.", false);
                            this.loadConfig(returnValue);
                        }
                    }else{
                        this.pushLog("Config: Couldn't reading file.", false);
                        this.loadConfig(returnValue);
                    }
                });
            }else{
                this.pushLog("Config: Couldn't find file.", false);
                this.loadConfig(returnValue);
            }
        }else{
            this.pushLog("Config: Read from Object.");
            this.loadConfig(config);
        }

    }


    // Functions
    public pushLog(log:string, successStatus?:boolean, source?:string){ // Don't call this directly. Rather call DaemonicDaemon.pushLog();
        this.IDCSender(this.constructor.name, "LogCTL", "pushLog", {log:log, successStatus:successStatus, source:source}, "");
    }

    private async loadConfig(configObj:daemonicFaeryConfigInterface){ // Don't call.
        this.hostname = configObj.hostname || this.hostname;
        this.daemonDefinitions = configObj.daemonDefinitions || this.daemonDefinitions;
        
        /*--Loading Daemons [Step-2]--*/
        for (let i=0;i<this.daemonDefinitions.length;i++){await this.loadDaemon(this.daemonDefinitions[i]);}

        /*--Starting Daemons [Step-3]--*/
        for (let daemonName in this.daemons){if(!this.daemons[daemonName].config.disableAutoStart){this.startDaemon(daemonName);}}
    }
    private async loadDaemon(daemonDefinition:daemonDefinitionInterface){ // Don't call.
        if(existsSync(daemonDefinition.fileLocation)){
            let imports = await import(daemonDefinition.fileLocation);
            if(daemonDefinition.daemonName in imports){
                try{
                    this.daemons[daemonDefinition.daemonName] = new imports[daemonDefinition.daemonName](this, daemonDefinition.configs);
                    this.pushLog(`Daemon: '${daemonDefinition.daemonName}' loaded`);
                }catch(e){
                    this.pushLog(`Daemon: '${daemonDefinition.daemonName}' failed to load\n${e}`, false);
                }
            }else{
                this.pushLog(`Daemon: Couldn't find class '${daemonDefinition.daemonName}' in file: ${daemonDefinition.fileLocation}`, false);
            }
        }else{
            this.pushLog(`Daemon: Couldn't find file: ${daemonDefinition.fileLocation}`, false);
        }
    }
    
    public IDCSender(from:string, to:string, signal:string, data:object, ID:string){ // Don't call. Rather call DaemonicDaemon.sender();
        if(to in this.daemons){
            (from!="LogCTL" && to!="LogCTL")?this.pushLog(`Inter-Daemon-Comms: '${signal}' sent from '${from}' to '${to}'`):undefined;
            this.daemons[to].IDCReceiver(from, signal, data, ID);
        }else{
            (from!="LogCTL" && to!="LogCTL")?this.pushLog(`Inter-Daemon-Comms: Failed to send '${signal}' from '${from}' to '${to}'`):undefined;
            (from!=this.constructor.name)?this.daemons[from].IDCReceiver("DaemonicFaery", "sendError", {}, ID):undefined;
        }
    }
    
    public startDaemon(daemonName:string){if (daemonName in this.daemons){ // Safe to call.
        try{
            this.pushLog(`Daemon: '${daemonName}' started`);
            this.daemons[daemonName].start();
            this.daemons[daemonName].isActive=true;
        }catch(e){
            this.pushLog(`Daemon: '${daemonName}' failed to start\n${e}`, false);
        }
    }}
    public stopDaemon(daemonName:string){if (daemonName in this.daemons){ // Safe to call.
        try{
            this.pushLog(`Daemon: '${daemonName}' stopped`);
            this.daemons[daemonName].stop();
            this.daemons[daemonName].isActive=false;
        }catch(e){
            this.pushLog(`Daemon: '${daemonName}' failed to stop\n${e}`, false);
        }
    }}
    public getDaemonStatus(daemonName:string):{exists: boolean, isActive: boolean} {return { // Safe to call.
        exists: (daemonName in this.daemons)?true:false,
        isActive: (daemonName in this.daemons)?this.daemons[daemonName].isActive:false
    };}
    public getFaeryStatus():{ // Safe to call.
        version: string,
        hostname: string,
        startTime: number,
        daemons: {daemonName:string, isActive:boolean}[]
    }{
        let daemons:{daemonName:string, isActive:boolean}[] = [];
        for (let item in this.daemons){daemons.push({daemonName: item, isActive: this.daemons[item].isActive});}
        return {
            version: this.version,
            hostname: this.hostname,
            startTime: this.startTime,
            daemons: daemons
        };
    }
}



// Daemon Related
export class DaemonicDaemon{
    public isActive:boolean=false;
    protected daemonicFaeryInstance:DaemonicFaery;
    public config:any;
    public variables:any;
    public signalResponseCallbackFunctions:{[key:string]:Function} = {};

    constructor(daemonicFaeryInstance:DaemonicFaery, config:any={}){
        this.daemonicFaeryInstance=daemonicFaeryInstance;
        this.config=config;
        this.variables={};

        this.onLoad();
    }

    public onLoad(){} // Don't call. Safe to change definition.
    protected pushLog(log:string, successStatus:boolean=true){this.daemonicFaeryInstance.pushLog(log, successStatus, this.constructor.name);} // Safe to call. Don't change definition.
    protected sender(to:string, signal:string, data:any, ID:string|undefined=undefined, signalResponseCallback?:Function){ // Safe to call. Don't change definition.
        let correctID=ID||randomUUID();
        if (typeof(signalResponseCallback)=="function"){
            this.signalResponseCallbackFunctions[correctID]=signalResponseCallback; //ToDo: Make this Async.
        }
        this.daemonicFaeryInstance.IDCSender(this.constructor.name, to, signal, data, correctID);
    }
    public IDCReceiver(from:string, signal:string, data:any, ID:string){ // Don't call. Don't change definition.
        if(ID in this.signalResponseCallbackFunctions){
            this.signalResponseCallbackFunctions[ID](data);
            delete this.signalResponseCallbackFunctions[ID];
        }else{
            this.receiver(from, signal, data, ID);
        }
    }
    public receiver(from:string, signal:string, data:any, ID:string){} // Don't call. Safe to change definition.
    public start(){} // Don't call. Rather call daemonicFaeryInstance.start(daemonName); Safe to change definition.
    public stop(){} // Don't call. Rather call daemonicFaeryInstance.stop(daemonName); Safe to change definition.
}



// Start Point
let daemonicFaeryInstance = new DaemonicFaery(process.argv[2] || "~/.config/daemonicFaery/config.json");
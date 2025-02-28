import { readFile, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import chalk from "chalk";

interface daemonDefinitionInterface{fileLocation:string;daemonName:string;configs?:object;}
interface daemonicFaeryConfigInterface{hostname?:string,daemonDefinitions?:daemonDefinitionInterface[],maxLogSize?:number}
export class DaemonicFaery{
    // Configurable
    private hostname: string = "RyServer";
    private daemonDefinitions: daemonDefinitionInterface[] = [];
    private maxLogSize: number = 100;
    
    // Non-Configurable
    private version:string = "2025.2.0";
    private startTime:number = Date.now();
    private log:((boolean|number|string)[])[] = [];
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
    public pushLog(log:string, successStatus:boolean=true, source:string="DaemonicFaery"){ // Don't call this directly. Rather call DaemonicDaemon.pushLog();
        while(this.log.length>=this.maxLogSize){this.log.shift();}
        this.log.push([successStatus, Date.now(), source, log]);

        let logItem = this.log[this.log.length-1];
        if (logItem[2]=="DaemonicFaery"){
            console.log(`${chalk.redBright("")}${chalk.bgRedBright.bold(logItem[2])}${chalk.redBright("")} ${logItem[0]?chalk.redBright("  ")+chalk.white(logItem[3]):chalk.redBright("  ")+chalk.redBright(logItem[3])}\n`);
        }else{
            console.log(`${chalk.cyan("")}${chalk.bgCyan.bold(logItem[2])}${chalk.cyan("")} ${logItem[0]?chalk.cyan("  ")+chalk.gray(logItem[3]):chalk.cyan("  ")+chalk.redBright(logItem[3])}\n`);
        }
    }

    private async loadConfig(configObj:daemonicFaeryConfigInterface){ // Don't call.
        this.hostname = configObj.hostname || this.hostname;
        this.daemonDefinitions = configObj.daemonDefinitions || this.daemonDefinitions;
        this.maxLogSize = configObj.maxLogSize || this.maxLogSize;
        
        /*--Loading Daemons [Step-2]--*/
        for (let i=0;i<this.daemonDefinitions.length;i++){await this.loadDaemon(this.daemonDefinitions[i]);}

        /*--Starting Daemons [Step-3]--*/
        for (let daemonName in this.daemons){this.startDaemon(daemonName);}
    }
    private async loadDaemon(daemonDefinition:daemonDefinitionInterface){ // Don't call.
        if(existsSync(daemonDefinition.fileLocation)){
            let imports = await import(daemonDefinition.fileLocation);
            if(daemonDefinition.daemonName in imports){
                this.daemons[daemonDefinition.daemonName] = new imports[daemonDefinition.daemonName](this, daemonDefinition.configs);
                this.pushLog(`Daemon: '${daemonDefinition.daemonName}' loaded`);
            }else{
                this.pushLog(`Daemon: Couldn't find class '${daemonDefinition.daemonName}' in file: ${daemonDefinition.fileLocation}`, false);
            }
        }else{
            this.pushLog(`Daemon: Couldn't find file: ${daemonDefinition.fileLocation}`, false);
        }
    }
    
    public IDCSender(from:string, to:string, signal:string, data:object, ID:string){ // Don't call. Rather call DaemonicDaemon.sender();
        if(to in this.daemons){
            this.pushLog(`Inter-Daemon-Comms: '${signal}' sent from '${from}' to '${to}'`);
            this.daemons[to].IDCReceiver(from, signal, data, ID);
        }else{
            this.pushLog(`Inter-Daemon-Comms: Failed to sent '${signal}' from '${from}' to '${to}'`);
            this.daemons[from].IDCReceiver("DaemonicFaery", "sendError", {}, ID);
        }
    }
    
    public startDaemon(daemonName:string){if (daemonName in this.daemons){ // Safe to call.
        this.pushLog(`Daemon: '${daemonName}' started`);
        this.daemons[daemonName].start();
        this.daemons[daemonName].isActive=true;
    }}
    public stopDaemon(daemonName:string){if (daemonName in this.daemons){ // Safe to call.
        this.pushLog(`Daemon: '${daemonName}' stopped`);
        this.daemons[daemonName].stop();
        this.daemons[daemonName].isActive=false;
    }}
    public getDaemonStatus(daemonName:string):object {return { // Safe to call.
        exists: (daemonName in this.daemons)?true:false,
        isActive: (daemonName in this.daemons)?this.daemons[daemonName].isActive:false
    };}
    public getFaeryStatus():{ // Safe to call.
        version: string,
        hostname: string,
        startTime: number,
        maxLogSize: number,
        daemons: {daemonName:string, isActive:boolean}[]
    }{
        let daemons:{daemonName:string, isActive:boolean}[] = [];
        for (let item in this.daemons){daemons.push({daemonName: item, isActive: this.daemons[item].isActive});}
        return {
            version: this.version,
            hostname: this.hostname,
            startTime: this.startTime,
            maxLogSize: this.maxLogSize,
            daemons: daemons
        };
    }
    public getLogs():((boolean|number|string)[])[] {return this.log;} // Safe to call.
}



// Daemon Related
export class DaemonicDaemon{
    public isActive:boolean=false;
    protected daemonicFaeryInstance:DaemonicFaery;
    protected config:any;
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
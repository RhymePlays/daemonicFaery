import { DaemonicDaemon } from "../daemonicFaery.ts";
import { readFile } from "node:fs";

export class QuickMCQ extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies: WebPort

    Daemon Config: {pageHTML: HTML code in string. WebPort listeners will be injected at [INJECTJSON] as JSON.}

    Daemon Usage: Basic WebPort Usage.
    
    \*--------------------------------*/
    reloadHTML(){
        readFile(this.config.pageLocation, "utf-8", (error, data)=>{if(!error && data){this.variables.pageHTML = data;}});
    }

    async start(){
        this.variables.pageHTML = "[INJECTJSON]";
        this.reloadHTML();

        this.sender("WebPort", "addListener", {
            webSignal: "QuickMCQ",
            respondWithSignal: "pageRequested",
            willRespond: true,
            likelyHTML: true
        });
        this.sender("WebPort", "addListener", {
            webSignal: "reloadHTML",
            respondWithSignal: "reloadRequested",
            willRespond: false
        });
    }
    stop(){this.sender("WebPort", "removeListener", "QuickMCQ");this.sender("WebPort", "removeListener", "reloadHTML");}
    receiver(from:string, signal:string, data:any, ID:string){
        if (signal=="pageRequested"){
            this.sender("WebPort", "getListeners", {}, undefined, (data:object)=>{this.variables.listeners=data;});
            this.sender("WebPort", "sendWebResponse", {
                webSignal: "QuickMCQ",
                webResponse: this.variables.pageHTML.replace("[INJECTJSON]", JSON.stringify({})),
                isHTML: this.variables.pageHTML=="[INJECTJSON]"?false:true
            });
        }else if (signal=="reloadRequested"){
            this.reloadHTML();
        }
    }
}
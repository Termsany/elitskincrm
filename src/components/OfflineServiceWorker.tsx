"use client";
import {useEffect} from "react";

export default function OfflineServiceWorker(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>undefined);
  },[]);
  return null;
}

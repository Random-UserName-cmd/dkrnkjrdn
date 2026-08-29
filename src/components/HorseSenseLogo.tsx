import React from "react";
// @ts-ignore
import logoSrc from "../assets/images/my_herd_logo_new_1784273818312.jpg";

interface HorseSenseLogoProps {
  className?: string;
}

export default function HorseSenseLogo({ className = "w-10 h-10 shrink-0" }: HorseSenseLogoProps) {
  return (
    <div 
      className={`${className} bg-black rounded-full flex items-center justify-center overflow-hidden border border-stone-900/40`}
      style={{ padding: "2px" }}
    >
      <img
        src={logoSrc}
        alt="Nova Herd Logo"
        className="w-full h-full rounded-full object-cover select-none"
        referrerPolicy="no-referrer"
        id="nova-herd-logo-image"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

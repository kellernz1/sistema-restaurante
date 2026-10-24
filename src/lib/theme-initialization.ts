// Apply the saved preference before the page paints; storage may be unavailable.
export const themeInitialization = `(()=>{let theme="system";try{theme=localStorage.getItem("mesa-certa-theme")}catch{}document.documentElement.dataset.theme=theme==="light"||theme==="dark"?theme:"system"})()`;

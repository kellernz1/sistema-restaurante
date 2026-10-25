import QRCode from "qrcode";
import { wrapText, type PrintDocument } from "./document";

export async function PrintDocumentView({ document }: { document: PrintDocument }) {
  const blocks = await Promise.all(document.blocks.map(async (block,index) => {
    if(block.type==="cut") return null;
    if(block.type==="rule") return <hr key={index} />;
    if(block.type==="qr") {
      const qr=await QRCode.toDataURL(block.value,{width:document.paperMm===58?160:200,margin:1});
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={index} alt="QR" src={qr} width={document.paperMm===58?160:200} height={document.paperMm===58?160:200} />;
    }
    return <p key={index} style={{fontWeight:block.bold?700:400,fontSize:block.large?"2em":"1em",textAlign:block.center?"center":"left",whiteSpace:"pre-wrap",margin:"6px 0"}}>{wrapText(block.text,block.large?Math.floor(document.columns/2):document.columns).join("\n")}</p>;
  }));
  const printableMm=document.paperMm===58?48:72;
  return <article className="engine-print-document" style={{width:`${printableMm}mm`,maxWidth:"100%",fontSize:`${(printableMm*96/25.4)/(document.columns*0.61)}px`}}>{blocks}</article>;
}

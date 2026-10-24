"use client";

export async function printKitchenTicket(orderId: string, beforePrint: () => Promise<void>) {
  const frame = document.createElement("iframe");
  frame.className = "kitchen-print-frame";
  frame.title = "Comanda da cozinha";
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("A comanda demorou para carregar. Confira a conexão e use a impressão manual.")), 15000);
    frame.onload = () => {
      clearTimeout(timer);
      if (frame.contentDocument?.querySelector(`[data-kitchen-ticket="${orderId}"]`)) resolve();
      else reject(new Error("Não foi possível carregar a comanda. Confira seu acesso e tente imprimir manualmente."));
    };
    frame.onerror = () => { clearTimeout(timer); reject(new Error("Não foi possível carregar a comanda.")); };
  });
  frame.src = `/print/kitchen/${encodeURIComponent(orderId)}`;
  document.body.appendChild(frame);
  try {
    await loaded;
    await frame.contentDocument?.fonts.ready;
    const target = frame.contentWindow;
    if (!target) throw new Error("Janela de impressão indisponível.");
    await beforePrint();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { target.removeEventListener("afterprint", done); reject(new Error("Não foi possível confirmar a abertura da impressão. Confira e use a impressão manual se necessário.")); }, 120000);
      function done() { clearTimeout(timer); target?.removeEventListener("afterprint", done); resolve(); }
      target.addEventListener("afterprint", done, { once: true });
      try { target.focus(); target.print(); }
      catch (failure) { clearTimeout(timer); target.removeEventListener("afterprint", done); reject(failure); }
    });
  } finally { frame.remove(); }
}

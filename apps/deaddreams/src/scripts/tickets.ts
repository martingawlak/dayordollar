import QRCode from "qrcode";
import { esc } from "./util.ts";
import type { SavedOrder } from "./wallet.ts";

/** Render an order's digital tickets: one QR code per person. */
export function renderTickets(box: HTMLElement, order: SavedOrder) {
  box.innerHTML = order.tickets
    .map(
      (t) => `<div class="ticket${t.status !== "valid" ? " void" : ""}">
        <canvas data-code="${esc(t.code)}" width="220" height="220" aria-label="Ticket QR code ${esc(t.code)}"></canvas>
        <code class="${t.checkedInAt ? "used" : ""}">${esc(t.code)}</code>
        <span class="muted">Ticket ${t.seq} of ${order.quantity} · ${esc(order.name)}${
          t.status !== "valid" ? " · <b>void</b>" : t.checkedInAt ? " · checked in" : ""
        }</span>
      </div>`,
    )
    .join("");
  box.querySelectorAll<HTMLCanvasElement>("canvas[data-code]").forEach((c) =>
    QRCode.toCanvas(c, c.dataset.code!, { width: 220, margin: 2, errorCorrectionLevel: "M", color: { dark: "#232323", light: "#ffffff" } }),
  );
}

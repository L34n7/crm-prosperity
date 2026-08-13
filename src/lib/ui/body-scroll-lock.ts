let bloqueiosAtivos = 0;
let overflowAnterior = "";

export function bloquearScrollBody() {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  if (bloqueiosAtivos === 0) {
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  bloqueiosAtivos += 1;
  let liberado = false;

  return () => {
    if (liberado) return;
    liberado = true;
    bloqueiosAtivos = Math.max(0, bloqueiosAtivos - 1);

    if (bloqueiosAtivos === 0) {
      document.body.style.overflow = overflowAnterior;
      overflowAnterior = "";
    }
  };
}

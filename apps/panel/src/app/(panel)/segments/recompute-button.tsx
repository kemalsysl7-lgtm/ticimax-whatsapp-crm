"use client";

import { useTransition } from "react";
import { recomputeSegmentsAction } from "../../actions";

export function RecomputeButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn-secondary" disabled={pending} onClick={() => start(() => recomputeSegmentsAction())}>
      {pending ? "Hesaplanıyor…" : "Yeniden hesapla"}
    </button>
  );
}

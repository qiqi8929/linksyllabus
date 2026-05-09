"use client";

import { useEffect } from "react";

export function LandingComparisonLightbox() {
  useEffect(() => {
    const root = document.getElementById("lp-root");
    if (!root) return;

    const modal = root.querySelector<HTMLElement>("[data-comparison-modal]");
    const modalImg = root.querySelector<HTMLImageElement>("[data-comparison-modal-img]");
    const modalLabel = root.querySelector<HTMLElement>("[data-comparison-modal-label]");
    const closeBtn = root.querySelector<HTMLElement>("[data-comparison-modal-close]");
    if (!modal || !modalImg || !modalLabel) return;

    const openModal = (src: string, label: string) => {
      modalImg.src = src;
      modalImg.alt = label;
      modalLabel.textContent = label;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    };

    const closeModal = () => {
      modal.classList.remove("open");
      document.body.style.overflow = "";
    };

    const onRootClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const trigger = target.closest<HTMLElement>("[data-comparison-trigger]");
      if (!trigger) return;
      const src = trigger.dataset.src ?? "";
      const label = trigger.dataset.label ?? "";
      if (!src || !label) return;
      openModal(src, label);
    };

    const onModalClick = (event: MouseEvent) => {
      if (event.target === modal) {
        closeModal();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    root.addEventListener("click", onRootClick);
    modal.addEventListener("click", onModalClick);
    closeBtn?.addEventListener("click", closeModal);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      root.removeEventListener("click", onRootClick);
      modal.removeEventListener("click", onModalClick);
      closeBtn?.removeEventListener("click", closeModal);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, []);

  return null;
}

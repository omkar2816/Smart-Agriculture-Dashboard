export type Tone = "good" | "info" | "watch" | "action" | "neutral";

/** Class sets for the earthy semantic palette (soft tinted background + readable text). */
export const TONE_CLASSES: Record<Tone, { chip: string; dot: string; bar: string; text: string; border: string }> = {
  good: {
    chip: "bg-[#e3ebd3] text-[#2c5a3c] border-[#c9d6b0]",
    dot: "bg-[#3d7a4c]",
    bar: "bg-[#3d7a4c]",
    text: "text-[#2c5a3c]",
    border: "border-[#c9d6b0]",
  },
  info: {
    chip: "bg-[#e1e9ee] text-[#3b566b] border-[#c5d3dc]",
    dot: "bg-[#4d6e86]",
    bar: "bg-[#4d6e86]",
    text: "text-[#3b566b]",
    border: "border-[#c5d3dc]",
  },
  watch: {
    chip: "bg-[#f4e8cc] text-[#7d5a12] border-[#e6d3a1]",
    dot: "bg-[#b8862a]",
    bar: "bg-[#b8862a]",
    text: "text-[#7d5a12]",
    border: "border-[#e6d3a1]",
  },
  action: {
    chip: "bg-[#f3dccf] text-[#8a3b1c] border-[#e4bfa8]",
    dot: "bg-[#b4552d]",
    bar: "bg-[#b4552d]",
    text: "text-[#8a3b1c]",
    border: "border-[#e4bfa8]",
  },
  neutral: {
    chip: "bg-[#ece6d6] text-[#5b6558] border-[#ddd5bf]",
    dot: "bg-[#9aa293]",
    bar: "bg-[#9aa293]",
    text: "text-[#5b6558]",
    border: "border-[#ddd5bf]",
  },
};

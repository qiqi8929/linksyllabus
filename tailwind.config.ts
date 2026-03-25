import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E8956D",
          50: "#FFF3EE",
          100: "#FFE3D7",
          200: "#FFC7AE",
          300: "#FFAB85",
          400: "#F49A75",
          500: "#E8956D",
          600: "#D67749",
          700: "#B7592F",
          800: "#8E4424",
          900: "#5F2E19"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)"
      },
      borderRadius: {
        xl: "14px"
      }
    }
  },
  plugins: []
} satisfies Config;


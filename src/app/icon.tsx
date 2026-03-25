import { ImageResponse } from "next/server";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          backgroundColor: "#E8956D"
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 9999,
            backgroundColor: "white"
          }}
        />
      </div>
    ),
    {
      width: size.width,
      height: size.height
    }
  );
}



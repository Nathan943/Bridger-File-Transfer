import React from "react";
import { useTheme } from "../context/ThemeContext";

const DropOverlay = () => {
	const { themeMode } = useTheme();

	return (
		<div
			className="vw-100 vh-100 position-absolute d-flex flex-column align-items-center justify-content-center"
			style={{
				backgroundColor: themeMode == "dark" ? "#000000ce" : "#00000098",
				zIndex: "9999",
				border: `4px dashed ${themeMode == "dark" ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.73)"}`,
			}}
		>
			<svg
				width="50"
				height="50"
				viewBox="0 0 60 60"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M58.8751 30.375C58.8751 33.6197 56.2448 36.25 53.0001 36.25H35.3751V53.875C35.3751 57.1197 32.7448 59.75 29.5001 59.75C26.2554 59.75 23.6251 57.1197 23.6251 53.875V36.25H5.875C2.63033 36.25 0 33.6197 0 30.375C0 27.1303 2.63033 24.5 5.875 24.5H23.6251V5.875C23.6251 2.63033 26.2554 4.76837e-07 29.5001 4.76837e-07C32.7448 4.76837e-07 35.3751 2.63033 35.3751 5.875V24.5C35.3751 24.5 49.7554 24.5 53.0001 24.5C56.2448 24.5 58.8751 27.1303 58.8751 30.375Z"
					fill="#d3d4d5"
				/>
			</svg>
			<h1 className="fw-bold mt-4 text-white">Drop files to send</h1>
		</div>
	);
};

export default DropOverlay;

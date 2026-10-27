import { useLayoutEffect, useRef, useState } from "react";
import PairingMenu from "./PairingMenu";
import { Message, Client } from "../types/types";
import MessageDisplay from "./MessageDisplay";
import Settings from "./Settings";
import backIconDark from "../icons/back-dark.png";
import backIconLight from "../icons/back-light.png";
import { useTheme } from "../context/ThemeContext";

interface Props {
	activePanel: "none" | "pairing" | "settings" | "contact";
	pairingCode: number;
	generatePairingCode: () => void;
	connectWithClient: (pairingCode: string) => void;
	onFileSelect: (file: File) => void;
	messages: Message[];
	isOnline: boolean;
	clearMessageHistory: (forgetDevices: boolean) => Promise<void>;
	isMobileUI: boolean;
	selectedClient?: Client;
	onMobileBackButton?: () => void;
}

const MainContent = ({
	activePanel,
	pairingCode,
	generatePairingCode,
	connectWithClient,
	onFileSelect,
	messages,
	isOnline,
	clearMessageHistory,
	isMobileUI,
	selectedClient,
	onMobileBackButton,
}: Props) => {
	const [isHovered, setIsHovered] = useState(false);

	const containerRef = useRef<HTMLDivElement>(null);

	const { theme, themeMode } = useTheme();

	useLayoutEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [messages, activePanel]);

	return (
		<div className="w-100 h-100 pb-4 d-flex flex-column align-items-center">
			{isMobileUI && (
				<div
					className="w-100 d-flex flex-row justify-content-start align-items-center"
					style={{
						backgroundColor: theme.background,
						minHeight: "60px",
					}}
				>
					<button
						className="btn btn-link mx-4 p-0 z-9999 d-flex align-items-center"
						style={{ height: "40px" }}
						onClick={onMobileBackButton}
					>
						<img
							src={ themeMode == "dark" ? backIconDark : backIconLight }
							height={"20px"}
						/>
					</button>

					<div className="d-flex flex-column justify-content-center">
						<h4 className="lh-1 my-0 p-0">
							{activePanel == "contact" && selectedClient && selectedClient.name}

							{activePanel == "pairing" && "Pair Device"}

							{activePanel == "settings" && "Settings"}
						</h4>
						{activePanel == "contact" && (
							<div className="lh-1 mt-1">
								{selectedClient?.online ? "Online" : "Offline"}
							</div>
						)}
					</div>
				</div>
			)}

			{activePanel == "pairing" ? (
				<PairingMenu
					pairingCode={pairingCode}
					generatePairingCode={generatePairingCode}
					connectWithClient={connectWithClient}
					isMobileUI={isMobileUI}
				/>
			) : activePanel == "settings" ? (
				<Settings
					clearMessageHistory={clearMessageHistory}
					isMobileUI={isMobileUI}
				/>
			) : activePanel == "contact" ? (
				<div
					className="d-flex flex-column flex-grow-1 w-100 align-items-center"
					style={{ height: isMobileUI ? "calc(100dvh - 60px)" : "100%" }}
				>
					<div
						className="d-flex flex-grow-1 overflow-auto mb-2 pt-4 w-100 justify-content-center"
						ref={containerRef}
					>
						<div className="mt-auto">
							{messages.map((msg) => (
								<MessageDisplay
									isIncoming={msg.sender != undefined}
									filename={msg.filename}
									filesize={msg.filesize}
									timestamp={msg.timestamp}
									downloadUrl={msg.downloadUrl ?? ""}
									status={msg.status}
									progress={msg.progress}
									key={msg.id}
								/>
							))}
						</div>
					</div>

					<label
						className={`btn d-flex align-items-center justify-content-center p-0 border-2 ${isOnline ? "btn-outline-primary" : "btn-outline-secondary"} ${isMobileUI ? "mb-2" : "mt-3"}`}
						style={{
							width: "66px",
							height: "66px",
							borderRadius: "50%",
							flexShrink: 0,
						}}
						onMouseEnter={() => setIsHovered(true)}
						onMouseLeave={() => setIsHovered(false)}
					>
						<svg
							width="25"
							height="25"
							viewBox="0 0 60 60"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M58.8751 30.375C58.8751 33.6197 56.2448 36.25 53.0001 36.25H35.3751V53.875C35.3751 57.1197 32.7448 59.75 29.5001 59.75C26.2554 59.75 23.6251 57.1197 23.6251 53.875V36.25H5.875C2.63033 36.25 0 33.6197 0 30.375C0 27.1303 2.63033 24.5 5.875 24.5H23.6251V5.875C23.6251 2.63033 26.2554 4.76837e-07 29.5001 4.76837e-07C32.7448 4.76837e-07 35.3751 2.63033 35.3751 5.875V24.5C35.3751 24.5 49.7554 24.5 53.0001 24.5C56.2448 24.5 58.8751 27.1303 58.8751 30.375Z"
								fill={
									isHovered
										? "#d3d4d5"
										: isOnline
											? "#0d6efd"
											: "#6c757d"
								}
							/>
						</svg>
						<input
							className=""
							type="file"
							hidden
							multiple
							disabled={!isOnline}
							onChange={(e) => {
								const files = e.target.files;
								if (files) {
									for (const file of files) {
										onFileSelect(file);
									}
								}
								e.target.value = "";
							}}
						/>
					</label>
				</div>
			) : (
				""
			)}
		</div>
	);
};

export default MainContent;

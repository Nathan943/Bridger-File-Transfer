import React, { useContext, useState } from "react";
import { ThemeMode, useTheme } from "../context/ThemeContext";
import editLight from "../icons/edit-light.png";
import editDark from "../icons/edit-dark.png";
import settingsLight from "../icons/settings-light.png";
import settingsDark from "../icons/settings-dark.png";

interface Props {
	name: string;
	editName: (name: string) => void;
	toggleSettings: () => void;
	onSettingsMenu: () => void;
}

const SettingsPopup = ({
	name,
	editName,
	toggleSettings,
	onSettingsMenu,
}: Props) => {
	const [open, setOpen] = useState(false);
	const [isHovered, setIsHovered] = useState(false);

	const [editIsHovered, setEditIsHovered] = useState(false);
	const [settingsIsHovered, setSettingsIsHovered] = useState(false);

	const [editing, setEditing] = useState(false);
	const [newName, setNewName] = useState(name);

	const { theme, themeMode } = useTheme();

	return (
		<div
			className="position-relative w-100 border-top pb-0 "
			style={{ paddingTop: "2.5cqw", marginBottom: "2.5cqw" }}
		>
			{editing ? (
				<input
					className="form-control fw-bold shadow-none"
					style={{
						fontSize: "clamp(20px, 7cqw, 40px)",
						padding: "6cqw",
					}}
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
					autoFocus
					onBlur={() => {
						editName(newName);
						setEditing(false);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							editName(newName);
							setEditing(false);
						}

						if (e.key === "Escape") {
							setNewName(name);
							setEditing(false);
						}
					}}
				/>
			) : (
				<button
					className="form-control btn w-100 fs-5 text-start shadow-none"
					style={{
						padding: "6cqw",
						fontWeight: "bold",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						boxShadow: "none",
						backgroundColor: open || isHovered ? theme.selected : theme.background,
					}}
					onClick={(e) => {
						setOpen(!open);
						e.currentTarget.blur();
					}}
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
				>
					<span style={{ fontSize: "clamp(20px, 7cqw, 40px)" }}>
						{name}
					</span>
				</button>
			)}

			{open && (
				<div
					className="position-absolute d-flex flex-column rounded-3 p-2 w-100"
					style={{
						bottom: "calc(100% + 3.33cqw)",
						overflow: "hidden",
						backgroundColor: theme.settingsPopupBackground,
					}}
				>
					<button
						className={`w-100 text-start rounded-3 border-0 d-flex flex-row align-items-center btn ${themeMode == "light" ? "btn-light" : "btn-dark"}`}
						style={{
							padding: "2.5cqw",
							paddingLeft: "5cqw",
							backgroundColor: editIsHovered
								? theme.hover
								: theme.settingsPopupBackground,
						}}
						onClick={() => {
							setOpen(false);
							setNewName(name);
							setEditing(true);
							setEditIsHovered(false);
						}}
						onMouseEnter={() => setEditIsHovered(true)}
						onMouseLeave={() => setEditIsHovered(false)}
					>
						<img
							src={ themeMode == "light" ? editLight : editDark }
							style={{
								width: "6cqw",
								height: "6cqw",
								marginRight: "4cqw",
							}}
						/>
						<span style={{ fontSize: "clamp(16px, 6cqw, 36px)" }}>
							Change Name
						</span>
					</button>
					<button
						className={`w-100 text-start rounded-3 border-0 d-flex flex-row align-items-center btn`}
						style={{
							padding: "2.5cqw",
							paddingLeft: "5cqw",
							backgroundColor: settingsIsHovered ? theme.hover : theme.settingsPopupBackground,
						}}
						onClick={() => {
							toggleSettings();
							setOpen(false);
							setSettingsIsHovered(false);
							onSettingsMenu();
						}}
						onMouseEnter={() => setSettingsIsHovered(true)}
						onMouseLeave={() => setSettingsIsHovered(false)}
					>
						<img
							src={ themeMode == "light" ? settingsLight : settingsDark }
							style={{
								width: "6cqw",
								height: "6cqw",
								marginRight: "4cqw",
							}}
						/>
						<span style={{ fontSize: "clamp(16px, 6cqw, 36px)" }}>
							Settings
						</span>
					</button>
				</div>
			)}
		</div>
	);
};

export default SettingsPopup;

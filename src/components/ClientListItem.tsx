import React, { useState } from "react";
import { Client } from "../types/types";
import { ThemeMode, useTheme } from "../context/ThemeContext";
import deleteIcon from "../icons/delete.png";
import deleteGrayIcon from "../icons/delete-gray.png";

interface Props {
	client: Client;
	selected: boolean;
	onClick: () => void;
	onDelete: () => void;
}

const ClientListItem = ({ client, selected, onClick, onDelete }: Props) => {
	const [isHovered, setIsHovered] = useState(false);
	const [isDeleteHovered, setIsDeleteHovered] = useState(false);

	const { theme } = useTheme();

	return (
		<li
			className={`w-100 list-group-item d-flex justify-content-between align-items-center border-0 rounded-3 `}
			style={{
				backgroundColor: selected || isHovered ? theme.selected : "transparent",
				cursor: "pointer",
				transition: "background-color 0.15s ease",
				padding: "2.5cqw 5cqw",
			}}
			onClick={onClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			key={client.id}
		>
			<div className="d-flex align-items-center">
				<div
					className="rounded-circle"
					style={{
						width: "8cqw",
						height: "8cqw",
						marginRight: "5cqw",
						backgroundColor: client.online ? "#22c55e" : "#979ea5",
					}}
				/>

				<span style={{ fontSize: "clamp(16px, 6cqw, 36px)" }}>
					{client.name}
				</span>
			</div>

			<button
				className="btn btn-link p-0 border-0 m-0 bg-transparent"
				style={{ lineHeight: 0 }}
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
				onMouseEnter={() => setIsDeleteHovered(true)}
				onMouseLeave={() => setIsDeleteHovered(false)}
			>
				<img
					src={isDeleteHovered ? deleteIcon : deleteGrayIcon}
					style={{
						width: "8cqw",
					}}
				/>
			</button>
		</li>
	);
};

export default ClientListItem;

import React from 'react';

const AllCores = (props) => {
	const { Cores } = props;

	const styles = {
		container: {
			maxWidth: '500px',
			margin: '50px auto',
			padding: '30px 40px',
			background: '#f0f4f8',
			borderRadius: '16px',
			boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
			fontFamily: 'Arial, Helvetica, sans-serif',
			color: '#1a1a2e',
			textAlign: 'center',
		},
		title: {
			fontSize: '22px',
			fontWeight: '700',
			color: '#2d4059',
			marginBottom: '20px',
			paddingBottom: '12px',
			borderBottom: '3px solid #e8edf2',
		},
		card: {
			background: '#ffffff',
			borderRadius: '12px',
			padding: '16px 20px',
			marginBottom: '12px',
			boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
			textAlign: 'left',
		},
		name: {
			display: 'block',
			fontSize: '17px',
			color: '#1a1a2e',
			marginBottom: '4px',
		},
		bio: {
			margin: 0,
			fontSize: '14px',
			color: '#4a4a5a',
			lineHeight: '1.5',
		},
		empty: {
			color: '#7a8a9a',
			fontSize: '16px',
			padding: '20px 0',
		},
	};

	return (
		<div style={styles.container}>
			<div style={styles.title}> Список ядер</div>

			{Cores.length === 0 ? (
				<p style={styles.empty}>Нет созданных ядер</p>
			) : (
				Cores.map((core, index) => (
					<div style={styles.card} key={index}>
						<strong style={styles.name}>{index + 1}. {core.NameCore}</strong>
						<p style={styles.bio}>{core.BioCore}</p>
					</div>
				))
			)}
		</div>
	);
};

export default AllCores;
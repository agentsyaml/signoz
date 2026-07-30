import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';

const PLACEHOLDER_STYLE: CSSProperties = {
	display: 'flex',
	boxSizing: 'border-box',
	width: '100%',
	minWidth: 0,
	margin: 0,
	alignItems: 'center',
	justifyContent: 'space-between',
	flexWrap: 'wrap',
	gap: 8,
	padding: '10px 12px',
	border: '1px dashed var(--l2-border)',
	borderRadius: 6,
	background: 'var(--l4-background)',
	color: 'var(--l2-foreground)',
};

const MEDIA_DETAILS_STYLE: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	flexWrap: 'wrap',
	gap: 6,
};

interface ExternalMediaProps {
	type: 'image' | 'audio';
	url?: string;
	alt?: string;
}

export function ExternalMedia({
	type,
	url,
	alt,
}: ExternalMediaProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const [audioSource, setAudioSource] = useState<{
		mediaUrl: string;
		objectUrl: string;
	} | null>(null);
	const mediaUrl = useMemo(() => {
		if (!url) {
			return null;
		}

		try {
			const parsed = new URL(url);
			return parsed.protocol === 'https:' ? parsed : null;
		} catch {
			return null;
		}
	}, [url]);

	useEffect(() => {
		setLoadedUrl(null);
	}, [type, url]);

	useEffect(() => {
		if (type !== 'audio' || !mediaUrl || loadedUrl !== mediaUrl.href) {
			return undefined;
		}

		const sourceUrl = mediaUrl.href;
		const controller = new AbortController();
		let active = true;
		let objectUrl: string | null = null;

		async function loadAudio(): Promise<void> {
			try {
				const response = await fetch(sourceUrl, {
					referrerPolicy: 'no-referrer',
					credentials: 'omit',
					mode: 'cors',
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error('Audio request failed');
				}

				const blob = await response.blob();
				if (!active) {
					return;
				}

				objectUrl = URL.createObjectURL(blob);
				setAudioSource({ mediaUrl: sourceUrl, objectUrl });
			} catch {
				if (active) {
					setFailedUrl(sourceUrl);
				}
			}
		}

		void loadAudio();

		return (): void => {
			active = false;
			controller.abort();
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [loadedUrl, mediaUrl, type]);

	const typeLabel = t(
		type === 'image' ? 'external_media_image' : 'external_media_audio',
	);
	const unavailableLabel = t(
		type === 'image' ? 'image_unavailable' : 'audio_unavailable',
	);

	if (!mediaUrl || failedUrl === mediaUrl.href) {
		return (
			<span
				className={
					type === 'image'
						? 'llm-chat-message__image-fallback'
						: 'llm-chat-message__audio-unavailable'
				}
				style={type === 'image' ? { display: 'block' } : undefined}
			>
				{unavailableLabel}
			</span>
		);
	}

	if (
		loadedUrl !== mediaUrl.href ||
		(type === 'audio' && audioSource?.mediaUrl !== mediaUrl.href)
	) {
		return (
			<fieldset
				aria-label={t('external_media_placeholder_label', {
					type: typeLabel,
					host: mediaUrl.host,
				})}
				style={PLACEHOLDER_STYLE}
			>
				<span style={MEDIA_DETAILS_STYLE}>
					<strong>{typeLabel}</strong>
					<code>{mediaUrl.host}</code>
				</span>
				<Button
					type="default"
					size="small"
					data-testid={`load-external-${type}`}
					onClick={(): void => setLoadedUrl(mediaUrl.href)}
				>
					{t('load_external_media')}
				</Button>
			</fieldset>
		);
	}

	if (type === 'image') {
		return (
			<img
				src={mediaUrl.href}
				alt={alt?.trim() || t('external_media_image_alt')}
				className="llm-chat-message__image"
				loading="lazy"
				decoding="async"
				referrerPolicy="no-referrer"
				crossOrigin="anonymous"
				onError={(): void => setFailedUrl(mediaUrl.href)}
			/>
		);
	}

	return (
		// Captions require a VTT URL, which these telemetry attributes do not provide.
		// A supplied transcript remains visible beside this control in ChatMessage.
		// oxlint-disable-next-line jsx-a11y/media-has-caption
		<audio
			controls
			preload="none"
			src={audioSource?.objectUrl}
			aria-label={t('external_media_audio_label', { host: mediaUrl.host })}
			className="llm-chat-message__audio"
			onError={(): void => {
				setFailedUrl(mediaUrl.href);
				setLoadedUrl(null);
			}}
		/>
	);
}

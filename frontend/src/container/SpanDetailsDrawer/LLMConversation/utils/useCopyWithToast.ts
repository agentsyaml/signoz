import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from 'react-use';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { useNotifications } from 'hooks/useNotifications';

export function useCopyWithToast(): (
	text: string,
	successMsgKey?: string,
) => Promise<void> {
	const { t } = useTranslation('llmConversation');
	const { notifications } = useNotifications();
	const [, copy] = useCopyToClipboard();

	return useCallback(
		async (text: string, successMsgKey = 'copied'): Promise<void> => {
			try {
				copy(text);
				notifications.success({
					message: t(successMsgKey),
				});
			} catch {
				notifications.error({
					message: SOMETHING_WENT_WRONG,
				});
			}
		},
		[copy, notifications, t],
	);
}

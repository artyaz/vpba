import type { WordRow } from './types';

/** Built-in fallback so the app is fully playable without a DATABASE_URL set.
 * These are your own rows, used as a preview seed. */
export const SAMPLE_WORDS: WordRow[] = [
	{
		id: 154,
		word: 'wallflower',
		definition:
			'A wallflower is a shy or quiet person who prefers to stay on the side and not take part in social activities or attract attention. Figuratively, it is used to describe someone who avoids the spotlight or blends into the background.\n\nTranslations to Ukrainian:\n1. Скромник\n2. Тихоня\n3. Непримітний',
		sentence:
			'1. Sarah felt like a wallflower at the party because she stood quietly in the corner and didn’t talk to anyone.\n2. He is a bit of a wallflower in class, always listening but never raising his hand to speak.\n3. In high school, I was a wallflower, watching others dance and have fun while I stayed on the side.',
		recollection: 1,
		created_at: '2026-06-23 17:36:34'
	},
	{
		id: 153,
		word: 'algae',
		definition:
			'Algae are simple plants that usually live in water. They can be green, red, or brown and often look like slimy or soft plants. They make their own food from sunlight.\n\nFiguratively, “algae” is not commonly used to describe people or things.\n\nUkrainian translations: водорості, альги, ламінарія',
		sentence:
			'1. Green algae grow on the rocks in the pond.\n2. The fish eat the algae in the aquarium to stay healthy.\n3. Social media can feel like algae, slowly covering your free time if you are not careful.',
		recollection: 1,
		created_at: '2026-06-23 17:31:24'
	},
	{
		id: 152,
		word: 'entrapment',
		definition:
			'Entrapment means when someone is tricked or forced into doing something wrong, usually a crime, by someone else, often to catch or blame them. Figuratively, it can also mean being trapped in a difficult or unfair situation.\n\nUkrainian translations:\nпастка\nзасідка\nпідстава',
		sentence:
			'1. The police arrested the man for drug dealing, but his lawyer said it was entrapment because an undercover officer pressured him to commit the crime.\n2. A spider uses its web for entrapment, catching insects that cannot escape.\n3. She felt a sense of entrapment in her job, as if she was trapped with no way to follow her dreams.',
		recollection: 1,
		created_at: '2026-06-23 17:29:53'
	}
];

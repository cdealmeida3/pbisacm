// An open card. Only picks the screen of its kind (D167): owners, SACM fix list, review list or one mailbox (the mapping
// backlog, D200, is a page the shell shows).
import { cardKind } from '../../view/cards.ts';
import type { CardSummary } from '../../view/cards.ts';
import { FixListCard } from './FixListCard.tsx';
import { MailboxCard } from './MailboxCard.tsx';
import { OwnerCard } from './OwnerCard.tsx';
import { ReviewListCard } from './ReviewListCard.tsx';

/** Screen 2: one card, drawn as the work it asks for. */
export function CardView({ card }: { card: CardSummary }) {
  switch (cardKind(card.pack)) {
    case 'mailbox': return <MailboxCard card={card} />;
    case 'review': return <ReviewListCard card={card} />;
    case 'fix': return <FixListCard card={card} />;
    case 'owners': return <OwnerCard card={card} />;
    // The mapping backlog is a page of its own (screens/backlog), which the shell shows in place of the card.
    case 'mapping': return null;
  }
}

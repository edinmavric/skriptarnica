import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { routes } from '@/config/routes';
import { formatNumber } from '@/lib/format';

interface Item {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: 'faculty' | 'course' | 'professor' | 'exam' | 'general';
  visibility: 'public' | 'faculty_only';
  memberCount: number;
  postCount: number;
}

export async function CommunityList({
  items,
  role,
}: {
  items: Item[];
  role?: Map<string, string>;
}) {
  const t = await getTranslations('forum.community');
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={routes.community(item.slug)}
            className="flex flex-col gap-1 py-3 hover:bg-paper-sunk sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.name}</span>
                <Badge tone="outline">{t(`types.${item.type}`)}</Badge>
                {item.visibility === 'faculty_only' ? (
                  <Badge tone="warning">{t('facultyOnly')}</Badge>
                ) : null}
                {role?.get(item.id) && role.get(item.id) !== 'member' ? (
                  <Badge tone="pen">{t(`roles.${role.get(item.id) as 'moderator'}`)}</Badge>
                ) : null}
              </span>
              {item.description ? (
                <span className="line-clamp-1 block text-sm text-ink-muted">
                  {item.description}
                </span>
              ) : null}
            </span>
            <span className="tabular text-sm whitespace-nowrap text-ink-muted">
              {t('stats', {
                members: formatNumber(item.memberCount),
                posts: formatNumber(item.postCount),
              })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

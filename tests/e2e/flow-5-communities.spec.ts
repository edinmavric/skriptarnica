import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

import { expectNoSeriousA11yViolations } from './helpers';
import { enableTwoFactor, grantAdmin, newTestUser, signUpAndVerify } from './support';

const COMMUNITY = '/z/oet1-etf-bg';

async function joinAndPost(page: Page, title: string, body: string, anonymous = false) {
  await page.goto(COMMUNITY);
  const join = page.getByRole('button', { name: 'Pridruži se' });
  if (await join.isVisible()) {
    await join.click();
    await expect(page.getByRole('button', { name: 'Član si' })).toBeVisible();
  }
  // Rendered only after the server confirmed the (optimistic) join and the page refreshed.
  await expect(page.getByRole('link', { name: 'Nova objava' })).toBeVisible();
  await page.getByRole('link', { name: 'Nova objava' }).click();
  await page.getByLabel(/^Naslov/).fill(title);
  await page.getByRole('textbox', { name: 'Tekst' }).fill(body);
  if (anonymous) await page.getByRole('switch', { name: 'Objavi anonimno' }).click();
  await page.getByRole('button', { name: 'Objavi', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url();
}

test.describe('flow 5: communities', () => {
  test('post, comment, vote, report, moderator removal', async ({ browser }) => {
    test.setTimeout(240_000);
    const authorCtx = await browser.newContext();
    const author = await authorCtx.newPage();
    await signUpAndVerify(author, newTestUser('poster'));
    const title = `Šta je bilo na oktobarskom roku ${Date.now().toString(36)}?`;
    const postUrl = await joinAndPost(author, title, 'Da li su bila **kola sa kondenzatorima**?');
    await expect(author.getByText('kola sa kondenzatorima')).toBeVisible();
    await expectNoSeriousA11yViolations(author);

    const readerCtx = await browser.newContext();
    const reader = await readerCtx.newPage();
    await signUpAndVerify(reader, newTestUser('reader'));
    await reader.goto(COMMUNITY);
    await reader.getByRole('button', { name: 'Pridruži se' }).click();
    await expect(reader.getByRole('button', { name: 'Član si' })).toBeVisible();
    // The join is optimistic; wait for the server-confirmed state before navigating away.
    await expect(reader.getByRole('link', { name: 'Nova objava' })).toBeVisible();
    await reader.goto(postUrl);
    // Optimistic upvote: the author's own vote makes 1, ours makes 2.
    const postVotes = reader.getByRole('group', { name: `Glasanje: ${title}` });
    await postVotes.getByRole('button', { name: 'Glasaj za' }).click();
    await expect(postVotes.getByRole('button', { name: 'Glasaj za' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(postVotes.getByText('2', { exact: true })).toBeVisible();
    await expect(postVotes).toHaveAttribute('aria-busy', 'false');
    await reader.reload();
    await expect(
      reader.getByRole('group', { name: `Glasanje: ${title}` }).getByText('2', { exact: true }),
    ).toBeVisible();

    await reader.getByLabel('Tvoj komentar').fill('Bila su, dva zadatka.');
    await reader.getByRole('button', { name: 'Komentariši' }).click();
    const comment = reader
      .getByRole('article', { name: /Komentar korisnika/ })
      .filter({ hasText: 'Bila su, dva zadatka.' });
    await expect(comment).toBeVisible();
    await comment.getByRole('button', { name: 'Odgovori' }).click();
    await reader.getByRole('textbox', { name: 'Odgovor' }).fill('I jedno pitanje iz teorije.');
    await reader.getByRole('button', { name: 'Odgovori', exact: true }).last().click();
    await expect(reader.getByText('I jedno pitanje iz teorije.')).toBeVisible();

    // Report the post.
    await reader.getByRole('button', { name: 'Prijavi' }).first().click();
    await reader.getByRole('radio', { name: 'Uvrede ili napad' }).check();
    await reader.getByRole('button', { name: 'Pošalji prijavu' }).click();
    await expect(reader.getByText('Hvala, prijava je poslata.', { exact: true })).toBeVisible();

    // Admin (moderator everywhere) sees the report and removes the post with a reason.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    const adminUser = newTestUser('forummod');
    await signUpAndVerify(admin, adminUser);
    grantAdmin(adminUser.email);
    await enableTwoFactor(admin, adminUser.password);
    await admin.goto(`${COMMUNITY}/moderacija`);
    await expect(admin.getByRole('link', { name: title })).toBeVisible();
    await expectNoSeriousA11yViolations(admin);
    await admin.getByRole('link', { name: title }).click();
    await admin.getByRole('button', { name: 'Moderacija' }).click();
    await admin.getByRole('menuitem', { name: 'Ukloni' }).click();
    await admin.getByRole('dialog').getByLabel('Razlog').fill('Lični napad u komentarima.');
    await admin.getByRole('dialog').getByRole('button', { name: 'Ukloni' }).click();
    await expect(admin.getByText('Uklonjeno: Lični napad u komentarima.')).toBeVisible();
    await admin.goto(`${COMMUNITY}/moderacija`);
    await expect(admin.getByRole('cell', { name: 'Uklonjena objava' }).first()).toBeVisible();

    // Regular users no longer see the content.
    await reader.goto(postUrl);
    await expect(reader.getByText('Moderator je uklonio ovu objavu.')).toBeVisible();
    await expect(reader.getByText('kola sa kondenzatorima')).toHaveCount(0);
    await reader.goto(COMMUNITY);
    await expect(reader.getByRole('link', { name: title })).toHaveCount(0);
    await Promise.all([authorCtx.close(), readerCtx.close(), adminCtx.close()]);
  });

  test('an anonymous author is not in the HTML (or RSC payload) for other users or guests', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const authorCtx = await browser.newContext();
    const author = await authorCtx.newPage();
    const user = newTestUser('anon', `Tajni Autor ${Date.now().toString(36)}`);
    await signUpAndVerify(author, user);
    const title = `Anonimno pitanje ${Date.now().toString(36)}`;
    const postUrl = await joinAndPost(author, title, 'Kako se priprema usmeni?', true);
    await author.getByLabel('Tvoj komentar').fill('Anonimni komentar autora.');
    await author.getByRole('switch', { name: 'Anonimno' }).click();
    await author.getByRole('button', { name: 'Komentariši' }).click();
    await expect(author.getByText('Anonimni komentar autora.')).toBeVisible();

    const readerCtx = await browser.newContext();
    const reader = await readerCtx.newPage();
    await signUpAndVerify(reader, newTestUser('anonreader'));
    for (const url of [postUrl, COMMUNITY, `/pretraga?q=${encodeURIComponent(title)}`]) {
      const html = await (await reader.request.get(url)).text();
      expect(html).toContain(title);
      expect(html).not.toContain(user.username);
      expect(html).not.toContain(user.name);
    }
    const guestHtml = await (await browser.newContext()).request.get(postUrl).then((r) => r.text());
    expect(guestHtml).not.toContain(user.username);
    expect(guestHtml).not.toContain(user.name);
    await reader.goto(postUrl);
    await expect(reader.getByText('Anonimno').first()).toBeVisible();
    await Promise.all([authorCtx.close(), readerCtx.close()]);
  });

  test('polls and sorting', async ({ page }) => {
    await signUpAndVerify(page, newTestUser('poller'));
    await page.goto(COMMUNITY);
    await page.getByRole('button', { name: 'Pridruži se' }).click();
    await expect(page.getByRole('link', { name: 'Nova objava' })).toBeVisible();
    await page.getByRole('link', { name: 'Nova objava' }).click();
    await page.getByRole('tab', { name: 'Anketa' }).click();
    const title = `Kad učite za OET? ${Date.now().toString(36)}`;
    await page.getByLabel(/^Naslov/).fill(title);
    await page.getByLabel('Odgovor 1').fill('Ujutru');
    await page.getByLabel('Odgovor 2').fill('Noću');
    await page.getByRole('button', { name: 'Objavi', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('radio', { name: /Noću/ }).check();
    await expect(page.getByText('100% (1)')).toBeVisible();
    for (const sort of ['Novo', 'Najbolje', 'Sporno', 'Popularno']) {
      await page.goto(COMMUNITY);
      await page.getByRole('link', { name: sort, exact: true }).click();
      await expect(page.getByRole('link', { name: sort, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });
});

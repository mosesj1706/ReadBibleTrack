/**
 * Row-level security, tested the way it is actually used: through PostgREST,
 * as signed-in people, with their own tokens.
 *
 * Checking policies with psql as `postgres` proves nothing — that role bypasses
 * RLS. Everything here goes over HTTP with a real user JWT, so a policy that
 * only looks correct fails here.
 *
 * Needs a local stack: `npx supabase start`, then `npm run test:rls`.
 * Not part of `npm test`, which stays free of infrastructure.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Local by default, but any project when the environment says so — the same
 * suite has to be able to prove a hosted database before anything ships to it.
 * The service key is read from the environment and never written to disk.
 */
function credentials(): { api: string; anon: string; service: string } {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    return { api: SUPABASE_URL, anon: SUPABASE_ANON_KEY, service: SUPABASE_SERVICE_ROLE_KEY };
  }
  const local = JSON.parse(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' }),
  ) as Record<string, string>;
  return { api: local.API_URL, anon: local.ANON_KEY, service: local.SERVICE_ROLE_KEY };
}

const { api: API, anon: ANON, service: SERVICE } = credentials();

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });

/** A signed-in person, with their own client and therefore their own policies. */
type Person = { name: string; id: string; db: SupabaseClient };

async function signUp(name: string): Promise<Person> {
  const email = `${name.toLowerCase()}-${Date.now()}@example.test`;
  const password = 'correct-horse-battery-staple';

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ok(created.data.user, `could not create ${name}: ${created.error?.message}`);

  const db = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password });
  assert.equal(error, null, `could not sign in ${name}: ${error?.message}`);

  const id = created.data.user.id;
  const profile = await db.from('profiles').insert({ id, display_name: name });
  assert.equal(profile.error, null, `could not create ${name}'s profile: ${profile.error?.message}`);

  return { name, id, db };
}

let anna: Person;
let sam: Person;
let ruth: Person;
let circleId: string;
let joinCode: string;

// Top level, not inside a describe: hooks declared inside one are scoped to
// that block, so the people would be deleted before the later suites ran.
before(async () => {
  anna = await signUp('Anna');
  sam = await signUp('Sam');
  ruth = await signUp('Ruth');
});

after(async () => {
  for (const person of [anna, sam, ruth]) {
    if (person?.id) await admin.auth.admin.deleteUser(person.id);
  }
});

describe('circles and their walls', () => {
  test('creating a circle makes you its owner', async () => {
    const { data, error } = await anna.db
      .from('circles')
      .insert({ name: 'The Hendersons', created_by: anna.id })
      .select('id, name, join_code')
      .single();

    assert.equal(error, null, error?.message ?? 'expected no error');
    assert.ok(data);
    circleId = data.id;
    joinCode = data.join_code;

    assert.match(joinCode, /^[A-HJ-NP-Z2-9]{6}$/, 'a speakable code with no O/0 or I/1/L');

    const { data: membership } = await anna.db
      .from('circle_members')
      .select('role')
      .eq('circle_id', circleId)
      .eq('user_id', anna.id)
      .single();
    assert.equal(membership?.role, 'owner', 'the trigger claimed the circle');
  });

  test('an outsider cannot see the circle at all', async () => {
    const { data, error } = await ruth.db.from('circles').select('id').eq('id', circleId);
    assert.equal(error, null, 'RLS hides rows rather than erroring');
    assert.deepEqual(data, [], 'Ruth is not in it, so it does not exist for her');
  });

  test('an outsider cannot guess their way in', async () => {
    const { error } = await ruth.db.rpc('join_circle', { code: 'ZZZZZZ' });
    assert.ok(error, 'a wrong code is refused');
    assert.match(error.message, /no circle/i);
  });

  test('the code lets someone in', async () => {
    const { data, error } = await sam.db.rpc('join_circle', { code: joinCode });
    assert.equal(error, null, error?.message ?? 'expected no error');
    assert.equal(data, circleId);

    const { data: seen } = await sam.db.from('circles').select('name').eq('id', circleId).single();
    assert.equal(seen?.name, 'The Hendersons', 'and now he can see it');
  });

  test('the code is case and space forgiving', async () => {
    const { error } = await sam.db.rpc('join_circle', { code: `  ${joinCode.toLowerCase()} ` });
    assert.equal(error, null, 'people type codes the way they hear them');
  });

  test('members see each other, outsiders see nobody', async () => {
    const mine = await sam.db.from('profiles').select('display_name').eq('id', anna.id);
    assert.deepEqual(mine.data, [{ display_name: 'Anna' }], 'Sam reads with Anna');

    const theirs = await ruth.db.from('profiles').select('display_name').eq('id', anna.id);
    assert.deepEqual(theirs.data, [], 'Ruth does not');
  });

  test('a circle lists its members', async () => {
    const { data } = await sam.db.from('circle_members').select('user_id').eq('circle_id', circleId);
    assert.equal(data?.length, 2);

    const { data: outside } = await ruth.db
      .from('circle_members')
      .select('user_id')
      .eq('circle_id', circleId);
    assert.deepEqual(outside, []);
  });
});

describe('the reading log', () => {
  test('a circle sees what its members read', async () => {
    // Genesis 1, as verse ids.
    const logged = await anna.db
      .from('reading_log')
      .insert({ user_id: anna.id, start_id: 1_001_001, end_id: 1_001_031 });
    assert.equal(logged.error, null, logged.error?.message ?? 'expected no error');

    const { data: mate } = await sam.db.from('reading_log').select('start_id').eq('user_id', anna.id);
    assert.equal(mate?.length, 1, 'Sam reads with Anna, so he can see it');

    const { data: stranger } = await ruth.db
      .from('reading_log')
      .select('start_id')
      .eq('user_id', anna.id);
    assert.deepEqual(stranger, [], 'Ruth cannot');
  });

  test('nobody can log reading in someone else’s name', async () => {
    const { error } = await sam.db
      .from('reading_log')
      .insert({ user_id: anna.id, start_id: 1_002_001, end_id: 1_002_025 });
    assert.ok(error, 'the insert policy refuses a forged user_id');
    assert.match(error.message, /row-level security/i);
  });

  test('nobody can delete someone else’s reading', async () => {
    await sam.db.from('reading_log').delete().eq('user_id', anna.id);
    const { data } = await anna.db.from('reading_log').select('id').eq('user_id', anna.id);
    assert.equal(data?.length, 1, 'Anna’s row survived Sam trying to remove it');
  });

  test('the canon bounds are enforced by the database', async () => {
    const { error } = await anna.db
      .from('reading_log')
      .insert({ user_id: anna.id, start_id: 99_999_999, end_id: 99_999_999 });
    assert.ok(error, 'a verse id outside the canon is refused');
    assert.match(error.message, /reading_log_in_canon/);
  });

  test('a backwards range is refused', async () => {
    const { error } = await anna.db
      .from('reading_log')
      .insert({ user_id: anna.id, start_id: 1_003_010, end_id: 1_003_001 });
    assert.ok(error);
    assert.match(error.message, /reading_log_ordered/);
  });
});

describe('where someone stopped reading', () => {
  test('a circle-mate cannot see your place, unlike your reading', async () => {
    const kept = await anna.db
      .from('reading_place')
      .upsert({ user_id: anna.id, verse_id: 1_001_023 });
    assert.equal(kept.error, null, kept.error?.message ?? 'expected no error');

    const { data: mine } = await anna.db.from('reading_place').select('verse_id');
    assert.equal(mine?.[0]?.verse_id, 1_001_023, 'Anna can see her own');

    // Deliberately unlike reading_log, which the circle does see. A shared
    // plan should not become a race, and where someone's eyes stopped last
    // night is nobody else's business.
    const { data: mate } = await sam.db
      .from('reading_place')
      .select('verse_id')
      .eq('user_id', anna.id);
    assert.deepEqual(mate, [], 'Sam reads with Anna and still cannot see it');
  });

  test('nobody can move someone else’s place', async () => {
    const { error } = await sam.db
      .from('reading_place')
      .upsert({ user_id: anna.id, verse_id: 66_022_021 });
    assert.ok(error, 'the policy refuses a forged user_id');
    assert.match(error.message, /row-level security/i);

    const { data } = await anna.db.from('reading_place').select('verse_id');
    assert.equal(data?.[0]?.verse_id, 1_001_023, 'Anna’s place is where she left it');
  });

  test('moving your own place replaces it rather than adding another', async () => {
    await anna.db.from('reading_place').upsert({ user_id: anna.id, verse_id: 43_003_016 });
    const { data } = await anna.db.from('reading_place').select('verse_id');
    assert.equal(data?.length, 1, 'one row per person, because it is a pointer');
    assert.equal(data?.[0]?.verse_id, 43_003_016);
  });

  test('a place outside the canon is refused by the database', async () => {
    const { error } = await anna.db
      .from('reading_place')
      .upsert({ user_id: anna.id, verse_id: 99_999_999 });
    assert.ok(error);
    assert.match(error.message, /reading_place_in_canon/);
  });
});

describe('profiles', () => {
  test('you cannot rename someone else', async () => {
    await sam.db.from('profiles').update({ display_name: 'Not Anna' }).eq('id', anna.id);
    const { data } = await anna.db.from('profiles').select('display_name').eq('id', anna.id).single();
    assert.equal(data?.display_name, 'Anna');
  });

  test('you cannot claim a profile that is not yours', async () => {
    const { error } = await sam.db
      .from('profiles')
      .insert({ id: ruth.id, display_name: 'Impostor' });
    assert.ok(error);
    assert.match(error.message, /row-level security|duplicate key/i);
  });

  test('a blank display name is refused', async () => {
    const { error } = await sam.db.from('profiles').update({ display_name: '   ' }).eq('id', sam.id);
    assert.ok(error, 'the check constraint holds');
  });
});

describe('kinds of circle', () => {
  test('a circle is a couple, a family, or friends', async () => {
    for (const kind of ['couple', 'family', 'friends']) {
      const { data, error } = await anna.db
        .from('circles')
        .insert({ name: `A ${kind}`, created_by: anna.id, kind })
        .select('kind')
        .single();
      assert.equal(error, null, error?.message ?? 'expected no error');
      assert.equal(data?.kind, kind);
    }
  });

  test('and nothing else', async () => {
    const { error } = await anna.db
      .from('circles')
      .insert({ name: 'A cult', created_by: anna.id, kind: 'congregation' });
    assert.ok(error, 'the check constraint holds');
  });

  test('friends is the default', async () => {
    const { data } = await anna.db
      .from('circles')
      .insert({ name: 'Unspecified', created_by: anna.id })
      .select('kind')
      .single();
    assert.equal(data?.kind, 'friends');
  });
});

describe('marking up a passage', () => {
  test('a mark has to do something', async () => {
    const { error } = await anna.db
      .from('marks')
      .insert({ user_id: anna.id, start_id: 43_003_016, end_id: 43_003_016 });
    assert.ok(error, 'no colour and no star is not a mark');
    assert.match(error.message, /marks_do_something/);
  });

  test('a highlight and a star can sit on the same verse', async () => {
    const { data, error } = await anna.db
      .from('marks')
      .insert({
        user_id: anna.id,
        start_id: 43_003_016,
        end_id: 43_003_016,
        colour: 'yellow',
        starred: true,
      })
      .select('colour, starred')
      .single();
    assert.equal(error, null, error?.message ?? 'expected no error');
    assert.deepEqual(data, { colour: 'yellow', starred: true });
  });

  test('what is in your margin stays yours until you share it', async () => {
    await anna.db.from('marks').insert({
      user_id: anna.id,
      start_id: 19_023_001,
      end_id: 19_023_006,
      starred: true,
    });

    const mate = await sam.db.from('marks').select('id').eq('user_id', anna.id);
    assert.deepEqual(mate.data, [], 'Sam reads with Anna but cannot see her private marks');
  });

  test('sharing a mark shows it to the circle, and nobody else', async () => {
    await anna.db.from('marks').insert({
      user_id: anna.id,
      start_id: 45_008_028,
      end_id: 45_008_028,
      colour: 'green',
      shared: true,
    });

    const mate = await sam.db.from('marks').select('colour').eq('user_id', anna.id);
    assert.deepEqual(mate.data, [{ colour: 'green' }], 'Sam sees the shared one only');

    const stranger = await ruth.db.from('marks').select('colour').eq('user_id', anna.id);
    assert.deepEqual(stranger.data, [], 'Ruth is in no circle with Anna');
  });

  test('the query the reader actually makes returns the circle and not yourself', async () => {
    // pullCircleMarks() selects every visible mark and excludes its own rows,
    // leaning entirely on the policy to decide what "visible" means. This is
    // that query, run as Sam: he should get Anna's shared mark and none of
    // his own, however many he has.
    await sam.db.from('marks').insert({
      user_id: sam.id,
      start_id: 1_001_001,
      end_id: 1_001_001,
      colour: 'blue',
      shared: true,
    });

    const seen = await sam.db
      .from('marks')
      .select('user_id, start_id, end_id, colour, starred')
      .neq('user_id', sam.id);

    assert.equal(seen.error, null, seen.error?.message ?? 'expected no error');
    const owners = new Set((seen.data ?? []).map((row) => row.user_id));
    assert.ok(!owners.has(sam.id), 'his own marks are excluded by the query');
    assert.ok(owners.has(anna.id), "Anna's shared mark comes back");

    // And the same query as someone outside the circle sees nothing of theirs.
    const stranger = await ruth.db
      .from('marks')
      .select('user_id')
      .neq('user_id', ruth.id);
    assert.deepEqual(stranger.data, [], 'Ruth shares a circle with nobody');
  });

  test('nobody can mark up a passage in your name', async () => {
    const { error } = await sam.db
      .from('marks')
      .insert({ user_id: anna.id, start_id: 1_001_001, end_id: 1_001_001, starred: true });
    assert.ok(error);
    assert.match(error.message, /row-level security/i);
  });
});

describe('notes in the margin', () => {
  test('a note is private by default', async () => {
    const { error } = await anna.db.from('notes').insert({
      user_id: anna.id,
      start_id: 43_011_035,
      end_id: 43_011_035,
      body: 'The shortest verse, and the one I keep coming back to.',
    });
    assert.equal(error, null, error?.message ?? 'expected no error');

    const mate = await sam.db.from('notes').select('body').eq('user_id', anna.id);
    assert.deepEqual(mate.data, [], 'not shared, so not visible');
  });

  test('a shared note reaches the circle only', async () => {
    await anna.db.from('notes').insert({
      user_id: anna.id,
      start_id: 40_006_009,
      end_id: 40_006_013,
      body: 'We prayed this together on Sunday.',
      shared: true,
    });

    const mate = await sam.db.from('notes').select('body').eq('user_id', anna.id);
    assert.equal(mate.data?.length, 1);
    assert.match(mate.data![0].body, /Sunday/);

    const stranger = await ruth.db.from('notes').select('body').eq('user_id', anna.id);
    assert.deepEqual(stranger.data, []);
  });

  test('an empty note is not a note', async () => {
    const { error } = await anna.db
      .from('notes')
      .insert({ user_id: anna.id, start_id: 1_001_001, end_id: 1_001_001, body: '   ' });
    assert.ok(error, 'the check constraint holds');
  });

  test('you cannot edit or delete someone else’s note', async () => {
    await sam.db.from('notes').update({ body: 'Rewritten' }).eq('user_id', anna.id);
    await sam.db.from('notes').delete().eq('user_id', anna.id);
    const { data } = await anna.db.from('notes').select('id').eq('user_id', anna.id);
    assert.equal(data?.length, 2, 'both of Anna’s notes survived');
  });
});

describe('the queries the circle screen actually makes', () => {
  let circleId = '';
  let joinCode = '';

  test('creating a circle returns the row it just made', async () => {
    const { data, error } = await anna.db
      .from('circles')
      .insert({ name: 'The Screen Test', kind: 'family', created_by: anna.id })
      .select('id, name, kind, join_code, created_by')
      .single();
    assert.equal(error, null, error?.message ?? 'expected no error');
    circleId = data!.id;
    joinCode = data!.join_code;
    assert.equal(data!.kind, 'family');
  });

  test('members come back with their names', async () => {
    await sam.db.rpc('join_circle', { code: joinCode });

    // Exactly what `membersOf` does. An embed was tried first and failed:
    // circle_members and profiles both reference auth.users but not each
    // other, so PostgREST has no relationship to follow.
    const { data: rows, error } = await anna.db
      .from('circle_members')
      .select('user_id, role')
      .eq('circle_id', circleId)
      .order('joined_at');
    assert.equal(error, null, error?.message ?? 'expected no error');
    assert.equal(rows?.length, 2);

    const ids = rows!.map((r) => r.user_id);
    const { data: profiles } = await anna.db
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);

    const names = (profiles ?? []).map((p) => p.display_name).sort();
    assert.deepEqual(names, ['Anna', 'Sam'], 'both names resolved');
  });

  test('the embed that does not work stays broken, on purpose', async () => {
    const { error } = await anna.db
      .from('circle_members')
      .select('user_id, profiles(display_name)')
      .eq('circle_id', circleId);
    assert.ok(error, 'if this ever starts working, membersOf can be simplified');
    assert.match(error.message, /relationship/i);
  });

  test('pushing replaces this person’s rows rather than adding to them', async () => {
    const send = async (ranges: [number, number][]) => {
      await anna.db.from('reading_log').delete().eq('user_id', anna.id);
      if (ranges.length > 0) {
        const { error } = await anna.db
          .from('reading_log')
          .insert(ranges.map(([start, end]) => ({ user_id: anna.id, start_id: start, end_id: end })));
        assert.equal(error, null, error?.message ?? 'expected no error');
      }
    };

    await send([[1_001_001, 1_001_031]]);
    await send([[1_001_001, 1_001_031], [43_003_016, 43_003_018]]);

    const { data } = await anna.db.from('reading_log').select('start_id').eq('user_id', anna.id);
    assert.equal(data?.length, 2, 'the second push replaced the first, it did not double it');
  });

  test('the circle sees each other’s reading, and a stranger sees none of it', async () => {
    // No filter by circle: row-level security decides what comes back.
    const { data: mate } = await sam.db.from('reading_log').select('user_id, start_id, end_id, read_on');
    assert.ok((mate ?? []).some((row) => row.user_id === anna.id), 'Sam sees Anna');

    const { data: stranger } = await ruth.db.from('reading_log').select('user_id');
    assert.ok(!(stranger ?? []).some((row) => row.user_id === anna.id), 'Ruth does not');
  });

  test('leaving a circle makes it disappear again', async () => {
    await sam.db.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', sam.id);
    const { data } = await sam.db.from('circles').select('id').eq('id', circleId);
    assert.deepEqual(data, [], 'out of the circle, out of sight');
  });
});

describe('taking reading back', () => {
  test('a removal is yours alone — the circle sees reading, not second thoughts', async () => {
    const made = await anna.db
      .from('reading_removals')
      .insert({ user_id: anna.id, start_id: 1_003_001, end_id: 1_003_024 });
    assert.equal(made.error, null, made.error?.message ?? 'expected no error');

    const { data: mine } = await anna.db.from('reading_removals').select('start_id');
    assert.equal(mine?.length, 1, 'Anna can see her own');

    // Deliberately unlike reading_log, which a circle does see. Changing your
    // mind about a chapter is not the same as reading it, and showing it would
    // make un-marking feel like an admission.
    const { data: mate } = await sam.db
      .from('reading_removals')
      .select('start_id')
      .eq('user_id', anna.id);
    assert.deepEqual(mate, [], 'Sam reads with Anna and still cannot see it');
  });

  test('nobody can record a removal in someone else’s name', async () => {
    const { error } = await sam.db
      .from('reading_removals')
      .insert({ user_id: anna.id, start_id: 1_001_001, end_id: 1_001_031 });
    assert.ok(error, 'the insert policy refuses a forged user_id');
    assert.match(error.message, /row-level security/i);
  });

  test('nobody can delete someone else’s removal, which would restore reading', async () => {
    await sam.db.from('reading_removals').delete().eq('user_id', anna.id);
    const { data } = await anna.db.from('reading_removals').select('id');
    assert.equal(data?.length, 1, 'Anna’s removal survived Sam trying to drop it');
  });

  test('a backwards or out-of-canon removal is refused by the database', async () => {
    const backwards = await anna.db
      .from('reading_removals')
      .insert({ user_id: anna.id, start_id: 1_003_010, end_id: 1_003_001 });
    assert.ok(backwards.error);
    assert.match(backwards.error.message, /reading_removals_ordered/);

    const outside = await anna.db
      .from('reading_removals')
      .insert({ user_id: anna.id, start_id: 99_999_999, end_id: 99_999_999 });
    assert.ok(outside.error);
    assert.match(outside.error.message, /reading_removals_in_canon/);
  });
});

describe('deleting your own account', () => {
  test('a circle you started stays with the people still in it', async () => {
    // Anna starts a circle, Sam joins, Anna leaves for good. The circle is the
    // whole point of the app; one person deleting their account must not
    // dissolve a family's shared reading.
    const { data: circle } = await anna.db
      .from('circles')
      .insert({ name: 'The kitchen table', created_by: anna.id })
      .select('id, join_code')
      .single();
    assert.ok(circle, 'the circle was made');
    await anna.db.from('circle_members').insert({ circle_id: circle.id, user_id: anna.id, role: 'owner' });
    await sam.db.from('circle_members').insert({ circle_id: circle.id, user_id: sam.id });

    const gone = await anna.db.rpc('delete_me');
    assert.equal(gone.error, null, gone.error?.message ?? 'expected no error');

    const { data: survived } = await sam.db.from('circles').select('id, created_by').eq('id', circle.id);
    assert.equal(survived?.length, 1, 'the circle outlived the person who made it');
    assert.equal(survived?.[0]?.created_by, sam.id, 'and Sam, who was still in it, now owns it');

    const { data: role } = await sam.db
      .from('circle_members')
      .select('role')
      .eq('circle_id', circle.id)
      .eq('user_id', sam.id)
      .single();
    assert.equal(role?.role, 'owner');
  });

  test('everything of theirs goes with them', async () => {
    const { data: left } = await sam.db.from('reading_log').select('id').eq('user_id', anna.id);
    assert.deepEqual(left, [], 'Anna’s reading went when Anna did');
  });

  test('a circle with nobody left in it is not kept', async () => {
    const { data: circle } = await ruth.db
      .from('circles')
      .insert({ name: 'On my own', created_by: ruth.id })
      .select('id')
      .single();
    assert.ok(circle, 'the circle was made');
    await ruth.db.from('circle_members').insert({ circle_id: circle.id, user_id: ruth.id, role: 'owner' });

    await ruth.db.rpc('delete_me');

    const { data } = await admin.from('circles').select('id').eq('id', circle.id);
    assert.deepEqual(data, [], 'an empty circle is not anything any more');
  });
});

describe('signed out', () => {
  const anon = createClient(API, ANON, { auth: { persistSession: false } });

  test('there is nothing to read without signing in', async () => {
    for (const table of ['profiles', 'circles', 'circle_members', 'reading_log']) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      assert.ok(error !== null || data?.length === 0, `${table} leaked to anon`);
    }
  });

  test('and no circle to join', async () => {
    const { error } = await anon.rpc('join_circle', { code: joinCode });
    assert.ok(error, 'join_circle refuses an anonymous caller');
  });
});

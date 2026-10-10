import { auth, signIn, signOut } from '@/auth';
import Chat from './chat';
import styles from './page.module.css';

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>Taskboard Agent</h1>
          <p>Okta アカウントでサインインすると、Taskboard の課題についてエージェントとチャットできます。</p>
          <form
            action={async () => {
              'use server';
              await signIn('okta');
            }}
          >
            <button type="submit" style={{ padding: '10px 20px', borderRadius: 128, cursor: 'pointer' }}>
              Okta でサインイン
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main} style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <h1>Taskboard Agent</h1>
          <form
            action={async () => {
              'use server';
              await signOut();
            }}
          >
            <button type="submit" style={{ padding: '8px 16px', borderRadius: 128, cursor: 'pointer' }}>
              サインアウト
            </button>
          </form>
        </div>
        <Chat />
      </main>
    </div>
  );
}

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
          <p>Sign in with your Okta account to chat with the agent about your Taskboard issues.</p>
          <form
            action={async () => {
              'use server';
              await signIn('okta');
            }}
          >
            <button type="submit" style={{ padding: '10px 20px', borderRadius: 128, cursor: 'pointer' }}>
              Sign in with Okta
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
              Sign out
            </button>
          </form>
        </div>
        <Chat />
      </main>
    </div>
  );
}

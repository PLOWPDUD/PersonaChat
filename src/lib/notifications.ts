export function getNotificationSupport() {
  if (typeof window === 'undefined') return { supported: false, permission: 'default' as NotificationPermission };
  return {
    supported: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default' as NotificationPermission
  };
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export async function showSystemNotification(title: string, options?: any) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    // Try to use service worker registration if available for better support (Android especially)
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          vibrate: [200, 100, 200],
          ...options
        });
        return;
      }
    }

    // Fallback to standard Notification API
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

export async function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered with scope:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

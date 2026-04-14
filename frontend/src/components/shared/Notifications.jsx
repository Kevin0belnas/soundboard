export default function Notifications({ notifications }) {
  return (
    <div className="notifications">
      {notifications.map((notification, index) => (
        <div key={index} className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      ))}
    </div>
  );
}
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { FiBell, FiCheck } from "react-icons/fi";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  // Fetch notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await axios.patch(
        `${API_BASE}/notifications/${notificationId}/read`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      fetchNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.patch(
        `${API_BASE}/notifications/read-all`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition"
      >
        <FiBell className="w-5 h-5" />

        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-90 bg-white rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-300 flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Your notifications</h3>
            {unreadCount > 0 && (
              <div className="flex gap-1 text-indigo-600 hover:text-indigo-800">
                <FiCheck className="w-5 h-5" />
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm  font-medium"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No notifications
            </div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`p-3 border-b border-gray-300 hover:bg-gray-50 transition`}
                >
                  <div className="flex items-start">
                    <button
                      onClick={() => handleMarkAsRead(notif._id)}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(notif.date).toLocaleDateString()}
                        </p>
                      </div>

                      {!notif.isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

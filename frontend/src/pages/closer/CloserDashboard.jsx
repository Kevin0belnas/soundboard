import { useState } from "react";
import { useNavigate } from "react-router-dom"; 
import ScriptList from "../../components/shared/ScriptList";
import ScriptForm from "../../components/shared/ScriptForm";
import VoiceSoundboard from "../../components/shared/VoiceSoundBoard";
import { 
  FiBook,  
  FiLogOut, 
  FiBell,
  FiMenu,
  FiX,
  FiChevronRight,
  FiSearch,
  FiRefreshCw,
  FiVolume2, 
} from "react-icons/fi";

export default function CloserDashboard({ onLogout, initialView = "scripts" }) {
  const [view, setView] = useState(() => {
    const path = window.location.pathname;
    if (path.includes("/closer/scripts")) return "scripts";
    if (path.includes("/closer/voice-soundboard")) return "voice-soundboard";
    
    return initialView;
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showAddAgentModal, setShowAddAgentModal] = useState(false); // Add this
  const [editingScript, setEditingScript] = useState(null);
  const [editingAgent, setEditingAgent] = useState(null); // Add this
  const [refreshKey, setRefreshKey] = useState(0);
  const [agentsRefreshKey, setAgentsRefreshKey] = useState(0); // Add this for agents list refresh
  
  const navigate = useNavigate();

  const handleViewChange = (newView) => {
    setView(newView);
    setIsMobileMenuOpen(false);
    navigate(`/closer/${newView}`);
  };

  const handleLogout = () => {
    setIsLoggingOut(true);
    localStorage.clear();
    if (onLogout) onLogout();
    navigate("/login");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Script modal handlers
  const handleOpenScriptForm = (script = null) => {
    setEditingScript(script);
    setShowScriptModal(true);
  };

  const handleCloseScriptForm = () => {
    setShowScriptModal(false);
    setEditingScript(null);
  };

  const handleScriptSaved = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Agent modal handlers - exactly like script form
  const handleOpenAgentForm = (agent = null) => {
    setEditingAgent(agent);
    setShowAddAgentModal(true);
  };

  const handleCloseAgentForm = () => {
    setShowAddAgentModal(false);
    setEditingAgent(null);
  };

  const handleAgentSaved = () => {
    setAgentsRefreshKey(prev => prev + 1); // Refresh the agents list
    setShowAddAgentModal(false);
    setEditingAgent(null);
  };

  const userName = localStorage.getItem("name") || "Admin User";
  const userInitial = userName.charAt(0).toUpperCase();

  const navItems = [
    { id: "scripts", label: "Scripts", icon: FiBook },
    { id: "voice-soundboard", label: "Voice Soundboard", icon: FiVolume2 },
  ];

  const pageTitle =
    view === "scripts"
      ? "Script Management"
      : view === "logs"
      ? "Activity Logs"
      : "Voice Soundboard";

  const pageSubtitle =
    view === "scripts"
      ? "Create, edit, and manage your automation scripts"
      : view === "logs"
      ? "Monitor and analyze system activity"
      : "Click a script and let ElevenLabs speak it";

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex ${isMobileMenuOpen ? 'overflow-hidden' : ''}`}>
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col
        bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-white
        transition-all duration-300 ease-in-out transform
        ${sidebarCollapsed ? 'w-20' : 'w-72'}
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        shadow-2xl lg:h-screen lg:sticky lg:top-0 overflow-hidden
      `}>
        <div className="h-20 flex items-center justify-between px-4 border-b border-gray-700/50">
          <div className="flex items-center space-x-3 overflow-hidden">
            {!sidebarCollapsed && (
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent font-serif">
                  Soundboard
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:block p-2 rounded-lg hover:bg-gray-700/50 transition"
            aria-label="Toggle sidebar"
          >
            <FiMenu className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-700/50 transition"
            aria-label="Close menu"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700/50">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-semibold text-lg shadow-lg">
                {userInitial}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-800"></div>
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="font-medium truncate">{userName}</p>
                <p className="text-xs text-gray-400 flex items-center">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></span>
                  Closer
                </p>
              </div>
            )}
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleViewChange(item.id)}
                className={`
                  w-full group relative
                  ${sidebarCollapsed ? 'px-2' : 'px-4'}
                  py-3 rounded-xl transition-all duration-200
                  ${isActive 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25' 
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'}`}>
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'animate-pulse' : ''}`} />
                  {!sidebarCollapsed && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                      {isActive && <FiChevronRight className="w-4 h-4 animate-pulse" />}
                    </>
                  )}
                </div>
                
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700/50">
            <div className="text-xs text-gray-400">
              <p>Version 1.0</p>
              <p>© 2026 soundboard</p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  aria-label="Open menu"
                >
                  <FiMenu className="w-6 h-6" />
                </button>

                <div>
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    {pageTitle}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {pageSubtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {view !== "voice-soundboard" && (
                  <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-3 py-2">
                    <FiSearch className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={`Search ${view}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ml-2 bg-transparent border-none focus:outline-none text-sm w-48"
                      aria-label={`Search ${view}`}
                    />
                  </div>
                )}

                <button
                  onClick={handleRefresh}
                  className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Refresh data"
                  disabled={isRefreshing}
                >
                  <FiRefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 text-gray-500 hover:text-gray-600 hover:bg-gray-100 rounded-lg relative"
                  aria-label="Notifications"
                >
                  <FiBell className="w-5 h-5" />
                </button>

                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="group flex items-center space-x-2 px-3 sm:px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:from-red-600 hover:to-red-700 transition shadow-lg shadow-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Logout"
                >
                  <FiLogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  <span className="hidden sm:inline">
                    {isLoggingOut ? "Logging out..." : "Logout"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
            {view === "scripts" && (
              <button
                onClick={() => handleOpenScriptForm()}
                className="group flex items-center space-x-2 px-3 sm:px-4 py-2 text-sm sm:text-base bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg shadow-indigo-500/25"
              >
                <span className="font-medium">New Script</span>
              </button>
            )}
            
            {view === "scripts" && (
              <div className="md:hidden flex items-center bg-white rounded-lg px-3 py-2 border border-gray-200 w-full sm:w-auto">
                <FiSearch className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${view}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ml-2 bg-transparent border-none focus:outline-none text-sm flex-1"
                  aria-label={`Search ${view}`}
                />
              </div>
            )}
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {view === "scripts" && (
              <ScriptList
                key={refreshKey}
                searchQuery={searchQuery}
                onEditScript={handleOpenScriptForm}
              />
            )}

          

            {view === "voice-soundboard" && <VoiceSoundboard />}
           
          </div>
        </main>
      </div>

      {showScriptModal && (
        <ScriptForm
          script={editingScript}
          onClose={handleCloseScriptForm}
          onSave={handleScriptSaved}
        />
      )}
    </div>
  );
}
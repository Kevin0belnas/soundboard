import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onItemsPerPageChange,
  onFirst,
  onPrev,
  onNext,
  onLast,
}) {
  const from = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const to = Math.min(currentPage * itemsPerPage, totalItems ?? 0);
  const total = (totalItems ?? 0).toLocaleString();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">

      {/* Count + per-page — stacks below page controls on mobile */}
      <div className="flex items-center gap-2 flex-wrap order-2 sm:order-1">
        {/* Short form on mobile, full form on sm+ */}
        <span className="text-xs sm:text-sm text-gray-700">
          <span className="sm:hidden">
            {from}–{to} of {total}
          </span>
          <span className="hidden sm:inline">
            Showing{" "}
            <span className="font-medium">{from}</span>
            {" "}to{" "}
            <span className="font-medium">{to}</span>
            {" "}of{" "}
            <span className="font-medium">{total}</span>
            {" "}results
          </span>
        </span>

        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="px-2 py-1 border border-gray-300 rounded-md text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {[25, 50, 100, 250, 1000, 2000].map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-0.5 order-1 sm:order-2">
        <button
          onClick={onFirst}
          disabled={currentPage === 1}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded"
          title="First page"
        >
          <FiChevronsLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded"
          title="Previous page"
        >
          <FiChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <span className="text-xs sm:text-sm text-gray-700 px-2 whitespace-nowrap">
          <span className="sm:hidden">{currentPage}/{totalPages}</span>
          <span className="hidden sm:inline">Page {currentPage} of {totalPages}</span>
        </span>

        <button
          onClick={onNext}
          disabled={currentPage === totalPages}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded"
          title="Next page"
        >
          <FiChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <button
          onClick={onLast}
          disabled={currentPage === totalPages}
          className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded"
          title="Last page"
        >
          <FiChevronsRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>

    </div>
  );
}
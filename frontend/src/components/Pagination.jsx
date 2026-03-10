import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

export default function Pagination({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange }) {
  return (
    <div className="mt-6 flex items-center justify-between px-2 border-t pt-4">
      <div className="flex items-center space-x-2">
        <p className="text-sm font-medium text-gray-700">Rows per page</p>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 w-[70px] border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {[10, 20, 30, 40, 50].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center space-x-6">
        <div className="text-sm font-medium text-gray-700">
          Page {currentPage} of {totalPages}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            className="hidden lg:flex h-8 w-8 items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronLeft className="h-4 w-4" />
            <FiChevronLeft className="h-4 w-4 -ml-2" />
          </button>

          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronRight className="h-4 w-4" />
          </button>

          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            className="hidden lg:flex h-8 w-8 items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronRight className="h-4 w-4" />
            <FiChevronRight className="h-4 w-4 -ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

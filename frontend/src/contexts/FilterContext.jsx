import { createContext, useContext, useState } from 'react';

const FilterContext = createContext();

export const useFilter = () => {
    const context = useContext(FilterContext);
    if (!context) {
        throw new Error('useFilter must be used within a FilterProvider');
    }
    return context;
};

export const FilterProvider = ({ children }) => {
    const [filterState, setFilterState] = useState({
        status: 'all', // all, completed, needs-review, pending
        assignmentId: null,
        filteredStudentIds: []
    });

    const updateFilter = (newState) => {
        setFilterState(prev => ({
            ...prev,
            ...newState
        }));
    };

    const resetFilter = () => {
        setFilterState({
            status: 'all',
            assignmentId: null,
            filteredStudentIds: []
        });
    };

    return (
        <FilterContext.Provider value={{ filterState, updateFilter, resetFilter }}>
            {children}
        </FilterContext.Provider>
    );
};
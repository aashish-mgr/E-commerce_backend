export interface PaginationOptions {
    page: number;
    limit: number;
    skip: number;
}

export interface paginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}


export const getPaginationParams = (pageQuery ?: string | string[], limitQuery ?: string | string[]): PaginationOptions => {
     const page = Math.max(Number(pageQuery) || 1, 1);

  const limit = Math.min(
    Math.max(Number(limitQuery) || 10, 1),
    100
  );
    return {
        page: page,
        limit: limit,
        skip: (page -1)  * limit
    }
}

export const getPaginationMeta = (page: number, limit: number , total: number): paginationMeta => {
    const totalPages = Math.ceil(total /limit);
    return {
        page: page,
        limit: limit,
        total: total,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
    }
}
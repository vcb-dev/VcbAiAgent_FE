// Kho footage cho bước chọn đầu của Studio.
//
// Dữ liệu nằm sẵn trong Postgres nên giữ lâu trong cache; chỉ công đoạn chế tác mới
// có thể phải chờ BE quét ổ ở lần đầu của mỗi sản phẩm.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nas } from "./api";

const HOUR = 60 * 60 * 1000;

export function useNasStatus() {
  return useQuery({ queryKey: ["nas", "status"], queryFn: nas.status, staleTime: 60_000 });
}

export function useCategories() {
  return useQuery({ queryKey: ["nas", "categories"], queryFn: nas.categories, staleTime: HOUR });
}

export function useProducts(code, readyOnly = false) {
  return useQuery({
    queryKey: ["nas", "products", code, readyOnly ? "ready" : "all"],
    queryFn: () => nas.products(code, "", readyOnly),
    enabled: !!code,
    staleTime: HOUR,
  });
}

/**
 * Kế hoạch A4 của một mã: BE bốc ngẫu nhiên 4 công đoạn + 2 cảnh HuyK từ DB.
 *
 * Mỗi lần gọi lại là một tổ hợp khác, nên không giữ cache — `refetch()` chính là nút
 * đổi cảnh. Mã nào chưa được nạp công đoạn thì BE quét ổ ngay lần đầu, có thể lâu.
 */
export function useA4Plan(code, sku) {
  return useQuery({
    queryKey: ["nas", "a4-plan", code, sku],
    queryFn: () => nas.a4Plan(code, sku),
    enabled: !!code && !!sku,
    staleTime: Infinity,
    retry: false,
    gcTime: HOUR,
  });
}

/** Toàn bộ công đoạn chế tác có trên ổ của một mã — dùng để soát xem đủ nguồn chưa. */
export function useCraftSteps(code, sku) {
  return useQuery({
    queryKey: ["nas", "craft-steps", code, sku],
    queryFn: () => nas.craftSteps(code, sku),
    enabled: !!code && !!sku,
    staleTime: HOUR,
    retry: false,
  });
}

export function useHuykActions() {
  return useQuery({ queryKey: ["nas", "huyk"], queryFn: nas.huykActions, staleTime: HOUR });
}

/**
 * Kéo footage của một mã từ ổ về máy.
 *
 * Xong thì bootstrap phải nạp lại, vì danh sách mã dựng được nằm trong đó.
 */
export function usePrepareFootage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, sku, craft, huyk }) => nas.prepare(code, sku, { craft, huyk }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["studio", "bootstrap"] }),
  });
}

/** Quét lại ổ. Dùng khi vừa thêm footage mới mà danh sách chưa thấy. */
export function useNasSync() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["nas"] });

  const products = useMutation({ mutationFn: nas.syncProducts, onSuccess: invalidate });
  const huyk = useMutation({ mutationFn: nas.syncHuyk, onSuccess: invalidate });
  const craft = useMutation({
    mutationFn: ({ code, sku }) => nas.craftSteps(code, sku, true),
    onSuccess: (_data, { code, sku }) =>
      queryClient.invalidateQueries({ queryKey: ["nas", "a4-plan", code, sku] }),
  });

  return { products, huyk, craft };
}

-- 一次性：把库里已有 SKU 全部标为已激活（支付关闭时使用）
update public.skus
set is_active = true
where is_active = false;

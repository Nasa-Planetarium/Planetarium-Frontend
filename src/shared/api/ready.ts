/**
 * 실제 데이터 요청 문(門). MSW 모드에서는 서비스 워커가 시작될 때까지 계약 API 요청을 붙잡아 둔다
 * (워커가 뜨기 전에 나간 요청이 실제 서버로 새는 것을 막음). http 모드에서는 처음부터 열려 있다.
 * 여는 쪽: src/app/boot/data-boot.tsx 하나.
 */
let open: () => void = () => {};
export const dataReady: Promise<void> = new Promise<void>((r) => {
  open = r;
});
export const openDataGate = () => open();

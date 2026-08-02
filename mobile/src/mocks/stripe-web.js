// No-op Stripe mock for web platform
const noop = () => {}
const noopAsync = async () => ({})

export const StripeProvider = ({ children }) => children

export const useStripe = () => ({
  confirmPayment: noopAsync,
  createPaymentMethod: noopAsync,
  handleNextAction: noopAsync,
  confirmSetupIntent: noopAsync,
  retrievePaymentIntent: noopAsync,
  collectBankAccountForPayment: noopAsync,
  collectBankAccountForSetup: noopAsync,
  verifyMicrodepositsForPayment: noopAsync,
  verifyMicrodepositsForSetup: noopAsync,
  createToken: noopAsync,
  initPaymentSheet: noopAsync,
  presentPaymentSheet: noopAsync,
  confirmPaymentSheetPayment: noopAsync,
  openApplePaySetup: noopAsync,
  isApplePaySupported: false,
})

export const CardField = () => null
export const CardForm = () => null
export const PaymentSheet = () => null
export const ApplePay = () => null

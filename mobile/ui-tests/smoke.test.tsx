import { render, screen } from '@testing-library/react-native';
import App from '../App';

test('app boots: splash then login screen, server reachable', async () => {
  await render(<App />);
  expect(await screen.findByText('Create an account', { exact: false }, { timeout: 15000 })).toBeTruthy();
  expect(await screen.findByLabelText('Connection: Online', {}, { timeout: 15000 })).toBeTruthy();
});

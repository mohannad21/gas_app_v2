from __future__ import annotations

# These tests document missing DELETE endpoints for two company activities.
# They are expected to FAIL until the endpoints are implemented.
# Ticket: Add DELETE /company/buy_iron/{id} and DELETE /company/cylinders/settle/{id}

from .helpers import (
    DAY0,
    DAY1,
    at,
    get_daily_card,
    post_buy_full_from_company,
    post_refill,
    post_return_empties_to_company,
)


def _inv(client, date=DAY1) -> dict:
    return get_daily_card(client, date)["inventory_end"]


class TestDeleteBuyIron:
    def test_delete_buy_iron_reverts_inventory(self, client, baseline):
        # Post buy_iron: full12 goes from 100 → 105
        result = post_buy_full_from_company(
            client,
            new12=5, new48=0,
            total_cost=300, paid_amount=300,
            happened_at=at(DAY1),
        )
        inv = _inv(client)
        assert inv["full12"] == 105

        # DELETE endpoint does not exist yet — this will fail with 404/405
        r = client.delete(f"/company/buy_iron/{result['id']}")
        assert r.status_code == 204, f"Expected 204, got {r.status_code}: {r.text}"

        # After delete, inventory should revert to baseline
        inv = _inv(client)
        assert inv["full12"] == 100


class TestDeleteReturnEmptiesToCompany:
    def test_delete_return_empties_reverts_inventory(self, client, baseline):
        # Create cylinder debt on DAY0 via refill
        post_refill(
            client,
            buy12=5, return12=0,
            buy48=0, return48=0,
            total_cost=0, paid_amount=0,
            happened_at=at(DAY0),
        )
        # Return 3 empties on DAY1: empty12 goes from 50 → 47
        result = post_return_empties_to_company(
            client, gas_type="12kg", quantity=3,
            happened_at=at(DAY1),
        )
        inv = _inv(client)
        assert inv["empty12"] == 47

        # DELETE endpoint does not exist yet — this will fail with 404/405
        r = client.delete(f"/company/cylinders/settle/{result['id']}")
        assert r.status_code == 204, f"Expected 204, got {r.status_code}: {r.text}"

        # After delete, inventory should revert
        inv = _inv(client)
        assert inv["empty12"] == 50

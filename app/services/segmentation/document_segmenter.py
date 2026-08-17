from typing import Any


class DocumentSegmenter:
    """
    Groups consecutive PDF pages that belong to the same
    classified document type.

    Example:

        Page 1 -> aadhaar
        Page 2 -> aadhaar
        Page 3 -> pan
        Page 4 -> resume
        Page 5 -> resume
        Page 6 -> 10th_marksheet

    Becomes:

        [
            {
                "document_type": "aadhaar",
                "pages": [1, 2]
            },
            {
                "document_type": "pan",
                "pages": [3]
            },
            {
                "document_type": "resume",
                "pages": [4, 5]
            },
            {
                "document_type": "10th_marksheet",
                "pages": [6]
            }
        ]
    """

    def group_pages(
        self,
        page_results: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Group consecutive pages having the same
        document classification.

        Args:
            page_results:
                Classification results for each PDF page.

        Returns:
            List of grouped documents with their page numbers.
        """

        if not page_results:
            return []

        groups: list[dict[str, Any]] = []

        current_group: dict[str, Any] | None = None

        for page in page_results:

            page_number = page.get(
                "page_number"
            )

            classification = page.get(
                "classification",
                {},
            )

            document_type = classification.get(
                "document_type",
                "unknown",
            )

            # -----------------------------------------
            # Start a new group if:
            # 1. There is no current group
            # 2. Document type has changed
            # -----------------------------------------

            if (
                current_group is None
                or current_group["document_type"]
                != document_type
            ):

                current_group = {
                    "document_type": document_type,
                    "pages": [],
                }

                groups.append(
                    current_group
                )

            # -----------------------------------------
            # Add current page to current group
            # -----------------------------------------

            current_group["pages"].append(
                page_number
            )

        return groups


    def get_group_pages(
        self,
        group: dict[str, Any],
        page_results: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Retrieve complete page-result objects
        belonging to a particular document group.

        Args:
            group:
                A grouped document returned by group_pages().

            page_results:
                Complete page processing results.

        Returns:
            List of page result dictionaries.
        """

        page_numbers = set(
            group.get("pages", [])
        )

        return [
            page
            for page in page_results
            if page.get("page_number")
            in page_numbers
        ]


    def get_document_summary(
        self,
        groups: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Generate a simple summary of detected documents.
        """

        return {
            "total_documents": len(groups),
            "documents": [
                {
                    "document_type": group[
                        "document_type"
                    ],
                    "pages": group["pages"],
                    "page_count": len(
                        group["pages"]
                    ),
                }
                for group in groups
            ],
        }


document_segmenter = DocumentSegmenter()